import { randomUUID } from 'node:crypto';
import { withTimeout, TimeoutError } from '../../common/async';
import { assertTransition } from '../applications/application-state-machine';
import { CircuitBreaker } from '../lenders/circuit-breaker';
import type {
  LenderAdapter,
  SubmissionParams,
  SubmissionResult,
} from '../lenders/lender-adapter.interface';
import type {
  AppStores,
  FinancingApplicationEntity,
  LenderApplicationEntity,
  LenderConfigurationEntity,
  LenderEntity,
  ProductCategory,
} from '../persistence/stores';
import { ResultApplier } from './result-applier';

const TECHNICAL_FAILURE_OUTCOMES = new Set<SubmissionResult['outcome']>([
  'TIMEOUT',
  'UNAVAILABLE',
  'RATE_LIMITED',
  'MALFORMED_RESPONSE',
]);

function isTechnicalFailureOutcome(outcome: SubmissionResult['outcome']): boolean {
  return TECHNICAL_FAILURE_OUTCOMES.has(outcome);
}

export interface WaterfallOptions {
  circuitBreakers?: Map<string, CircuitBreaker>;
  defaultTimeoutMs?: number;
}

export class WaterfallOrchestrator {
  private readonly breakers: Map<string, CircuitBreaker>;
  private readonly defaultTimeoutMs: number;
  private readonly applier: ResultApplier;

  constructor(
    private readonly stores: AppStores,
    private readonly adapters: Map<string, LenderAdapter>,
    options: WaterfallOptions = {},
  ) {
    this.breakers = options.circuitBreakers ?? new Map();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;
    this.applier = new ResultApplier(stores);
  }

  private getCircuitBreaker(lenderCode: string): CircuitBreaker {
    let cb = this.breakers.get(lenderCode);
    if (!cb) {
      cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30000 });
      this.breakers.set(lenderCode, cb);
    }
    return cb;
  }

  /**
   * Orchestrates the financing application through eligible lenders.
   */
  async execute(applicationId: string): Promise<FinancingApplicationEntity> {
    let app = await this.stores.applications.findById(applicationId);
    if (!app) throw new Error(`Application ${applicationId} not found`);

    const customer = await this.stores.customers.findById(app.customerId);
    if (!customer) throw new Error(`Customer ${app.customerId} not found`);

    const purchase = await this.stores.purchases.findById(app.purchaseId);
    if (!purchase) throw new Error(`Purchase ${app.purchaseId} not found`);

    // Transition from SUBMITTED to LENDER_PROCESSING
    if (app.status === 'SUBMITTED' || app.status === 'CUSTOMER_CONSENT_PENDING') {
      if (app.status === 'CUSTOMER_CONSENT_PENDING') {
        assertTransition('CUSTOMER_CONSENT_PENDING', 'SUBMITTED', { actor: 'SYSTEM' });
        app = await this.stores.applications.updateStatus({
          id: app.id,
          expectedVersion: app.version,
          toStatus: 'SUBMITTED',
          actorType: 'SYSTEM',
          submittedAt: new Date(),
        });
      }

      assertTransition('SUBMITTED', 'LENDER_PROCESSING', { actor: 'SYSTEM' });
      app = await this.stores.applications.updateStatus({
        id: app.id,
        expectedVersion: app.version,
        toStatus: 'LENDER_PROCESSING',
        actorType: 'SYSTEM',
      });
    }

    // Discover eligible lenders
    const allLenders = await this.stores.lenders.list('ACTIVE');
    const eligibleLenders: Array<{ lender: LenderEntity; config: LenderConfigurationEntity }> = [];

    for (const lender of allLenders) {
      const config = await this.stores.lenders.getConfig(lender.id);
      if (!config || !config.enabled) continue;

      // Amount checks
      if (config.minAmountPaise !== null && app.requestedAmountPaise < config.minAmountPaise) continue;
      if (config.maxAmountPaise !== null && app.requestedAmountPaise > config.maxAmountPaise) continue;

      // Category checks
      if (
        config.supportedCategories.length > 0 &&
        !config.supportedCategories.includes(purchase.productCategory)
      ) {
        continue;
      }

      eligibleLenders.push({ lender, config });
    }

    if (eligibleLenders.length === 0) {
      // No eligible lenders available
      assertTransition(app.status, 'DECLINED', { actor: 'SYSTEM', lenderConfirmed: true });
      return this.stores.applications.updateStatus({
        id: app.id,
        expectedVersion: app.version,
        toStatus: 'DECLINED',
        actorType: 'SYSTEM',
        reason: 'No eligible lenders match requested financing criteria',
      });
    }

    // Sort by priority (lowest integer runs first)
    eligibleLenders.sort((a, b) => a.config.priority - b.config.priority);

    if (app.routingMode === 'DISCOVERY') {
      return this.executeDiscoveryMode(app, customer, purchase, eligibleLenders);
    }

    return this.executeSequentialMode(app, customer, purchase, eligibleLenders);
  }

  private async invokeAdapterWithBreaker(params: {
    submission: SubmissionParams;
    timeoutMs: number;
    lender: LenderEntity;
    adapter: LenderAdapter | undefined;
    breaker: CircuitBreaker;
  }): Promise<SubmissionResult> {
    const { submission, timeoutMs, lender, adapter, breaker } = params;
    if (!adapter) {
      return {
        outcome: 'UNAVAILABLE',
        errorCode: 'ADAPTER_NOT_FOUND',
        safeResponseSummary: { error: `No registered adapter for ${lender.code}` },
      };
    }

    const permit = breaker.tryAcquire();
    if (!permit.allowed) {
      return {
        outcome: 'UNAVAILABLE',
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        safeResponseSummary: { breakerState: permit.state },
      };
    }

    try {
      const result = await withTimeout(adapter.submitApplication(submission), timeoutMs);
      if (isTechnicalFailureOutcome(result.outcome)) {
        permit.recordFailure();
      } else {
        permit.recordSuccess();
      }
      return result;
    } catch (err) {
      permit.recordFailure();
      if (err instanceof TimeoutError) {
        return { outcome: 'TIMEOUT', errorCode: 'TIMEOUT_EXCEEDED' };
      }
      return { outcome: 'UNAVAILABLE', errorCode: 'LENDER_INVOCATION_EXCEPTION' };
    } finally {
      permit.release();
    }
  }

  private async executeSequentialMode(
    application: FinancingApplicationEntity,
    customer: { id: string; fullName: string; phone: string },
    purchase: { id: string; amountPaise: bigint; productCategory: ProductCategory },
    eligibleLenders: Array<{ lender: LenderEntity; config: LenderConfigurationEntity }>,
  ): Promise<FinancingApplicationEntity> {
    let currentApp = application;

    for (let i = 0; i < eligibleLenders.length; i++) {
      const { lender, config } = eligibleLenders[i]!;
      const isFinal = i === eligibleLenders.length - 1;
      const adapter = this.adapters.get(lender.code);
      const breaker = this.getCircuitBreaker(lender.code);

      // Create lender application attempt record
      const requestKey = `req_${randomUUID()}`;
      const lenderApp = await this.stores.lenderApplications.create({
        applicationId: currentApp.id,
        merchantId: currentApp.merchantId,
        lenderId: lender.id,
        attemptNo: i + 1,
        requestKey,
        externalReference: null,
        outcome: 'PENDING',
        errorCode: null,
        responseHash: null,
        safeResponseSummary: null,
        reconcileAttempts: 0,
        startedAt: new Date(),
        completedAt: null,
        latencyMs: null,
      });

      const submissionParams: SubmissionParams = {
        applicationId: currentApp.id,
        requestKey,
        merchantId: currentApp.merchantId,
        customer,
        purchase,
        requestedAmountPaise: currentApp.requestedAmountPaise,
        requestedTenureMonths: currentApp.requestedTenureMonths,
      };

      const timeoutMs = config.requestTimeoutMs || this.defaultTimeoutMs;
      const result = await this.invokeAdapterWithBreaker({
        submission: submissionParams,
        timeoutMs,
        lender,
        adapter,
        breaker,
      });

      const outcome = await this.applier.apply({
        application: currentApp,
        lenderApplication: lenderApp,
        lender,
        result,
        isFinalLenderInWaterfall: isFinal,
      });

      currentApp = outcome.application;

      // If lender made an offer or requires additional info, stop waterfall
      if (
        outcome.appliedStatus === 'OFFER_AVAILABLE' ||
        outcome.appliedStatus === 'ADDITIONAL_INFORMATION_REQUIRED'
      ) {
        return currentApp;
      }
    }

    return currentApp;
  }

  private async executeDiscoveryMode(
    application: FinancingApplicationEntity,
    customer: { id: string; fullName: string; phone: string },
    purchase: { id: string; amountPaise: bigint; productCategory: ProductCategory },
    eligibleLenders: Array<{ lender: LenderEntity; config: LenderConfigurationEntity }>,
  ): Promise<FinancingApplicationEntity> {
    const discoveryLenders = eligibleLenders.filter((l) => l.config.supportsDiscovery);
    const targets = discoveryLenders.length > 0 ? discoveryLenders : eligibleLenders;

    let currentApp = application;

    interface DiscoveryOutcome {
      lender: LenderEntity;
      lenderApp: LenderApplicationEntity;
      result: SubmissionResult;
    }

    const settledOutcomes: DiscoveryOutcome[] = await Promise.all(
      targets.map(async ({ lender, config }, index) => {
        const adapter = this.adapters.get(lender.code);
        const breaker = this.getCircuitBreaker(lender.code);
        const requestKey = `disc_${randomUUID()}`;

        const lenderApp = await this.stores.lenderApplications.create({
          applicationId: application.id,
          merchantId: application.merchantId,
          lenderId: lender.id,
          attemptNo: index + 1,
          requestKey,
          externalReference: null,
          outcome: 'PENDING',
          errorCode: null,
          responseHash: null,
          safeResponseSummary: null,
          reconcileAttempts: 0,
          startedAt: new Date(),
          completedAt: null,
          latencyMs: null,
        });

        const result = await this.invokeAdapterWithBreaker({
          submission: {
            applicationId: application.id,
            requestKey,
            merchantId: application.merchantId,
            customer,
            purchase,
            requestedAmountPaise: application.requestedAmountPaise,
            requestedTenureMonths: application.requestedTenureMonths,
          },
          timeoutMs: config.requestTimeoutMs || this.defaultTimeoutMs,
          lender,
          adapter,
          breaker,
        });

        return { lender, lenderApp, result };
      }),
    );

    const offerOutcomes = settledOutcomes.filter(
      (o) => o.result.outcome === 'OFFERED' && (o.result.offers?.length ?? 0) > 0,
    );
    const nonOfferOutcomes = settledOutcomes.filter(
      (o) => !(o.result.outcome === 'OFFERED' && (o.result.offers?.length ?? 0) > 0),
    );

    // Apply all offers sequentially so application version bumps never collide concurrently
    for (const item of offerOutcomes) {
      const applied = await this.applier.apply({
        application: currentApp,
        lenderApplication: item.lenderApp,
        lender: item.lender,
        result: item.result,
        isFinalLenderInWaterfall: false,
      });
      currentApp = applied.application;
    }

    // Persist remaining lender outcomes sequentially without overwriting available offers
    for (let i = 0; i < nonOfferOutcomes.length; i++) {
      const item = nonOfferOutcomes[i]!;
      if (
        currentApp.status === 'OFFER_AVAILABLE' &&
        item.result.outcome === 'ADDITIONAL_INFO_REQUIRED'
      ) {
        await this.stores.lenderApplications.updateOutcome({
          id: item.lenderApp.id,
          outcome: item.result.outcome,
          externalReference: item.result.externalReference,
          errorCode: item.result.errorCode,
          safeResponseSummary: item.result.safeResponseSummary,
          latencyMs: item.result.latencyMs,
        });
        continue;
      }

      const isFinal =
        i === nonOfferOutcomes.length - 1 &&
        currentApp.status !== 'OFFER_AVAILABLE' &&
        currentApp.status !== 'ADDITIONAL_INFORMATION_REQUIRED';

      const applied = await this.applier.apply({
        application: currentApp,
        lenderApplication: item.lenderApp,
        lender: item.lender,
        result: item.result,
        isFinalLenderInWaterfall: isFinal,
      });
      currentApp = applied.application;
    }

    return currentApp;
  }
}

