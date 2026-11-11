import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors';
import { assertTransition } from '../applications/application-state-machine';
import { CommissionService } from '../ledger/commission.service';
import type {
  AppStores,
  FinancingApplicationEntity,
  LenderApplicationEntity,
  WebhookEventEntity,
} from '../persistence/stores';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISBURSED_EVENT_TYPES = new Set(['LOAN_DISBURSED', 'DISBURSEMENT_SUCCESSFUL']);
const SUPPORTED_EVENT_TYPES = new Set([
  'LOAN_DISBURSED',
  'DISBURSEMENT_SUCCESSFUL',
  'LOAN_DECLINED',
]);
const ELIGIBLE_DISBURSEMENT_STATUSES = new Set([
  'CUSTOMER_ACCEPTED_OFFER',
  'LENDER_FINAL_CONFIRMATION',
  'DISBURSEMENT_PENDING',
]);
const ELIGIBLE_DECLINE_STATUSES = new Set([
  'LENDER_PROCESSING',
  'LENDER_FINAL_CONFIRMATION',
]);

interface ParsedWebhookPayload {
  eventId?: string;
  id?: string;
  eventType?: string;
  type?: string;
  applicationId?: string;
  lenderApplicationId?: string;
  externalReference?: string;
  lenderReference?: string;
  amountPaise?: bigint;
  declineReason?: string;
}

export interface ProcessWebhookParams {
  lenderCode: string;
  rawPayload: string;
  signatureHeader?: string;
  timestampHeader?: string;
}

export interface WebhookResult {
  eventId: string;
  processed: boolean;
  duplicate: boolean;
  status: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalHintString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function readStrictOptionalString(
  obj: Record<string, unknown>,
  key: string,
  errorTags: WeakMap<object, string>,
): string | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'string' || val.trim().length === 0) {
    const err = new BadRequestError(`Webhook field ${key} must be a non-empty string`);
    errorTags.set(err, 'INVALID_PAYLOAD');
    throw err;
  }
  return val.trim();
}

function parsePositivePaise(
  value: unknown,
  errorTags: WeakMap<object, string>,
): bigint | undefined {
  if (value === undefined) return undefined;

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      const err = new BadRequestError('Webhook amountPaise must be a positive integer');
      errorTags.set(err, 'INVALID_AMOUNT');
      throw err;
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      const err = new BadRequestError('Webhook amountPaise must be a positive integer');
      errorTags.set(err, 'INVALID_AMOUNT');
      throw err;
    }
    const parsed = BigInt(trimmed);
    if (parsed <= 0n) {
      const err = new BadRequestError('Webhook amountPaise must be a positive integer');
      errorTags.set(err, 'INVALID_AMOUNT');
      throw err;
    }
    return parsed;
  }

  const err = new BadRequestError('Webhook amountPaise must be a positive integer');
  errorTags.set(err, 'INVALID_AMOUNT');
  throw err;
}

export class WebhookService {
  private readonly errorCodes = new WeakMap<object, string>();

  constructor(
    private readonly stores: AppStores,
    private readonly toleranceSeconds = 300,
    private readonly commissionService: CommissionService = new CommissionService(stores),
  ) {}

  verifySignature(
    secret: string,
    rawPayload: string,
    signatureHeader?: string,
    timestampHeader?: string,
  ): boolean {
    if (!signatureHeader) return false;

    // Timestamp freshness verification (replay attack defense)
    if (timestampHeader) {
      const ts = Number(timestampHeader);
      if (!Number.isFinite(ts)) return false;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > this.toleranceSeconds) {
        return false;
      }
    }

    const payloadToSign = timestampHeader ? `${timestampHeader}.${rawPayload}` : rawPayload;
    const expected = createHmac('sha256', secret).update(payloadToSign).digest('hex');

    const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();
    if (expected.length !== cleanSignature.length) return false;
    if (!/^[0-9a-f]+$/i.test(cleanSignature)) return false;

    return timingSafeEqual(
      new Uint8Array(Buffer.from(expected, 'hex')),
      new Uint8Array(Buffer.from(cleanSignature, 'hex')),
    );
  }

  async processWebhook(params: ProcessWebhookParams): Promise<WebhookResult> {
    const { lenderCode, rawPayload, signatureHeader, timestampHeader } = params;

    const lender = await this.stores.lenders.findByCode(lenderCode);
    if (!lender) throw new NotFoundError(`Lender ${lenderCode} not found`);

    const secret = this.resolveWebhookSecret(
      lenderCode,
      (await this.stores.lenders.getConfig(lender.id))?.secretRef,
    );

    const isSignatureValid = this.verifySignature(
      secret,
      rawPayload,
      signatureHeader,
      timestampHeader,
    );

    const payloadHash = createHash('sha256').update(rawPayload).digest('hex');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayload);
    } catch {
      if (!isSignatureValid) {
        throw new UnauthorizedError('Invalid webhook signature or stale timestamp');
      }
      throw new BadRequestError('Invalid webhook JSON body');
    }

    if (!isPlainObject(parsedJson)) {
      if (!isSignatureValid) {
        throw new UnauthorizedError('Invalid webhook signature or stale timestamp');
      }
      throw new BadRequestError('Webhook payload must be a JSON object');
    }

    const eventId =
      readOptionalHintString(parsedJson, 'eventId') ??
      readOptionalHintString(parsedJson, 'id') ??
      `evt_${payloadHash.substring(0, 16)}`;
    const eventType =
      readOptionalHintString(parsedJson, 'eventType') ??
      readOptionalHintString(parsedJson, 'type') ??
      'UNKNOWN';
    const externalReferenceHint =
      readOptionalHintString(parsedJson, 'externalReference') ??
      readOptionalHintString(parsedJson, 'lenderReference');
    const amountPaiseHint = parsedJson.amountPaise;

    // Signature verification runs before duplicate-return handling so forged/replayed
    // invalid-signature payloads are always rejected with 401.
    const existing = await this.stores.webhooks.findByEvent(lender.id, eventId);
    if (!isSignatureValid) {
      if (!existing) {
        await this.recordRejectedInvalidSignature(
          lender.id,
          eventId,
          eventType,
          payloadHash,
          externalReferenceHint,
          amountPaiseHint,
        );
      }
      throw new UnauthorizedError('Invalid webhook signature or stale timestamp');
    }

    if (existing) {
      return {
        eventId,
        processed: existing.processingStatus === 'PROCESSED',
        duplicate: true,
        status: existing.processingStatus,
      };
    }

    // Best-effort read-only lookup so WebhookEvent links to LenderApplication without
    // trusting an unverified body.lenderApplicationId foreign key.
    const hintedLenderApp = externalReferenceHint
      ? await this.stores.lenderApplications.findByExternalReference(
          lender.id,
          externalReferenceHint,
        )
      : null;

    let recordedEvent: WebhookEventEntity;
    try {
      recordedEvent = await this.stores.webhooks.recordReceived({
        lenderId: lender.id,
        lenderApplicationId: hintedLenderApp?.id ?? null,
        eventId,
        eventType,
        signatureValid: true,
        processingStatus: 'RECEIVED',
        payloadHash,
        safePayloadSummary: {
          eventType,
          lenderReference: externalReferenceHint,
          amountPaise:
            typeof amountPaiseHint === 'number' || typeof amountPaiseHint === 'string'
              ? amountPaiseHint
              : undefined,
        },
        errorCode: null,
        processedAt: null,
      });
    } catch (err: unknown) {
      if (err instanceof ConflictError) {
        const raced = await this.stores.webhooks.findByEvent(lender.id, eventId);
        if (raced) {
          return {
            eventId,
            processed: raced.processingStatus === 'PROCESSED',
            duplicate: true,
            status: raced.processingStatus,
          };
        }
      }
      throw err;
    }

    try {
      return await this.validateAndApplyWebhook(
        lender.id,
        recordedEvent.id,
        eventId,
        eventType,
        parsedJson,
        externalReferenceHint,
        hintedLenderApp,
      );
    } catch (err: unknown) {
      await this.markFailedSafely(recordedEvent.id, err);
      throw err;
    }
  }

  private resolveWebhookSecret(lenderCode: string, secretRef?: string | null): string {
    let secret: string | undefined = secretRef ? process.env[secretRef] : undefined;
    const isProduction = process.env.NODE_ENV === 'production';

    // In non-production environments only, support direct raw secret if configured
    if (
      !secret &&
      !isProduction &&
      secretRef &&
      secretRef.length >= 16 &&
      !secretRef.startsWith('LENDER_') &&
      !secretRef.includes('_SECRET')
    ) {
      secret = secretRef;
    }

    // Development-only fallback credentials require explicit non-production configuration
    if (!secret && !isProduction) {
      secret = process.env.DEV_DEFAULT_WEBHOOK_SECRET;
    }

    if (!secret) {
      throw new UnauthorizedError(`Webhook secret is not configured for lender ${lenderCode}`);
    }

    return secret;
  }

  private async recordRejectedInvalidSignature(
    lenderId: string,
    eventId: string,
    eventType: string,
    payloadHash: string,
    externalReferenceHint: string | undefined,
    amountPaiseHint: unknown,
  ): Promise<void> {
    try {
      await this.stores.webhooks.recordReceived({
        lenderId,
        lenderApplicationId: null,
        eventId,
        eventType,
        signatureValid: false,
        processingStatus: 'REJECTED_INVALID_SIGNATURE',
        payloadHash,
        safePayloadSummary: {
          eventType,
          lenderReference: externalReferenceHint,
          amountPaise:
            typeof amountPaiseHint === 'number' || typeof amountPaiseHint === 'string'
              ? amountPaiseHint
              : undefined,
        },
        errorCode: 'INVALID_SIGNATURE',
        processedAt: null,
      });
    } catch (err: unknown) {
      if (!(err instanceof ConflictError)) {
        throw err;
      }
    }
  }

  private failWith(errorCode: string, err: Error): never {
    this.errorCodes.set(err, errorCode);
    throw err;
  }

  private parsePayload(parsedJson: Record<string, unknown>): ParsedWebhookPayload {
    const eventId = readStrictOptionalString(parsedJson, 'eventId', this.errorCodes);
    const id = readStrictOptionalString(parsedJson, 'id', this.errorCodes);
    const eventType = readStrictOptionalString(parsedJson, 'eventType', this.errorCodes);
    const type = readStrictOptionalString(parsedJson, 'type', this.errorCodes);
    const applicationId = readStrictOptionalString(parsedJson, 'applicationId', this.errorCodes);
    const lenderApplicationId = readStrictOptionalString(
      parsedJson,
      'lenderApplicationId',
      this.errorCodes,
    );
    const externalReference = readStrictOptionalString(
      parsedJson,
      'externalReference',
      this.errorCodes,
    );
    const lenderReference = readStrictOptionalString(
      parsedJson,
      'lenderReference',
      this.errorCodes,
    );
    const declineReason = readStrictOptionalString(parsedJson, 'declineReason', this.errorCodes);
    const amountPaise = parsePositivePaise(parsedJson.amountPaise, this.errorCodes);

    if (applicationId && !UUID_REGEX.test(applicationId)) {
      this.failWith('INVALID_IDENTIFIER', new BadRequestError('Invalid applicationId format'));
    }
    if (lenderApplicationId && !UUID_REGEX.test(lenderApplicationId)) {
      this.failWith(
        'INVALID_IDENTIFIER',
        new BadRequestError('Invalid lenderApplicationId format'),
      );
    }

    return {
      eventId,
      id,
      eventType,
      type,
      applicationId,
      lenderApplicationId,
      externalReference,
      lenderReference,
      amountPaise,
      declineReason,
    };
  }

  private async validateAndApplyWebhook(
    lenderId: string,
    webhookEventRecordId: string,
    eventId: string,
    eventType: string,
    parsedJson: Record<string, unknown>,
    preResolvedExternalRef: string | undefined,
    preResolvedLenderApp: LenderApplicationEntity | null,
  ): Promise<WebhookResult> {
    const payload = this.parsePayload(parsedJson);

    if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
      this.failWith(
        'UNSUPPORTED_EVENT_TYPE',
        new BadRequestError(`Unsupported webhook eventType: ${eventType}`),
      );
    }

    const { app, lenderApp, externalRef } = await this.resolveTargetApplication(
      lenderId,
      payload,
      preResolvedExternalRef,
      preResolvedLenderApp,
    );

    return await this.runInTransaction(async (txStores) => {
      const currentApp = await txStores.applications.findById(app.id);
      if (!currentApp) {
        this.failWith('APPLICATION_NOT_FOUND', new NotFoundError('Application not found'));
      }

      if (DISBURSED_EVENT_TYPES.has(eventType)) {
        return await this.applyDisbursementEvent(
          txStores,
          lenderId,
          webhookEventRecordId,
          eventId,
          currentApp,
          lenderApp,
          externalRef,
          payload.amountPaise,
        );
      }

      return await this.applyDeclineEvent(
        txStores,
        webhookEventRecordId,
        eventId,
        currentApp,
        payload.declineReason,
      );
    });
  }

  private async resolveTargetApplication(
    lenderId: string,
    payload: ParsedWebhookPayload,
    preResolvedExternalRef: string | undefined,
    preResolvedLenderApp: LenderApplicationEntity | null,
  ): Promise<{
    app: FinancingApplicationEntity;
    lenderApp: LenderApplicationEntity | null;
    externalRef: string | undefined;
  }> {
    const externalRef = payload.externalReference ?? payload.lenderReference;
    const { applicationId, lenderApplicationId } = payload;

    if (!externalRef && !applicationId && !lenderApplicationId) {
      this.failWith(
        'MISSING_TARGET_REFERENCE',
        new BadRequestError(
          'Webhook payload must reference externalReference, lenderApplicationId, or applicationId',
        ),
      );
    }

    let lenderApp: LenderApplicationEntity | null = externalRef
      ? externalRef === preResolvedExternalRef
        ? preResolvedLenderApp
        : await this.stores.lenderApplications.findByExternalReference(lenderId, externalRef)
      : null;

    if (lenderApplicationId) {
      if (lenderApp && lenderApp.id !== lenderApplicationId) {
        this.failWith(
          'APPLICATION_REFERENCE_MISMATCH',
          new BadRequestError('Webhook lenderApplicationId does not match externalReference'),
        );
      }
      if (!lenderApp) {
        const candidate = await this.stores.lenderApplications.findById(lenderApplicationId);
        if (candidate) {
          if (candidate.lenderId !== lenderId) {
            this.failWith(
              'APPLICATION_LENDER_MISMATCH',
              new NotFoundError('Lender application not found for this lender'),
            );
          }
          lenderApp = candidate;
        } else if (!externalRef && !applicationId) {
          this.failWith(
            'LENDER_APPLICATION_NOT_FOUND',
            new NotFoundError('Lender application not found'),
          );
        }
      }
    }

    if (lenderApp && applicationId && lenderApp.applicationId !== applicationId) {
      this.failWith(
        'APPLICATION_REFERENCE_MISMATCH',
        new BadRequestError('Webhook applicationId does not match lender externalReference'),
      );
    }

    const targetApplicationId = lenderApp?.applicationId ?? applicationId;
    if (!targetApplicationId) {
      this.failWith(
        'LENDER_APPLICATION_NOT_FOUND',
        new NotFoundError('Lender application not found for externalReference'),
      );
    }

    const app = await this.stores.applications.findById(targetApplicationId);
    if (!app) {
      this.failWith('APPLICATION_NOT_FOUND', new NotFoundError('Application not found'));
    }

    // If fallback by applicationId was used when lender applications already exist on the
    // application, ensure this lender actually owns at least one attempt on that application.
    if (!lenderApp) {
      const appAttempts = await this.stores.lenderApplications.listByApplication(app.id);
      if (appAttempts.length > 0 && !appAttempts.some((attempt) => attempt.lenderId === lenderId)) {
        this.failWith(
          'APPLICATION_LENDER_MISMATCH',
          new NotFoundError('Lender application not found for this lender'),
        );
      }
    }

    return { app, lenderApp, externalRef };
  }

  private async applyDisbursementEvent(
    txStores: AppStores,
    lenderId: string,
    webhookEventRecordId: string,
    eventId: string,
    currentApp: FinancingApplicationEntity,
    lenderApp: LenderApplicationEntity | null,
    externalRef: string | undefined,
    requestedAmountPaise: bigint | undefined,
  ): Promise<WebhookResult> {
    if (!ELIGIBLE_DISBURSEMENT_STATUSES.has(currentApp.status)) {
      const errorCode =
        currentApp.status === 'DISBURSED' ? 'ALREADY_DISBURSED' : 'INVALID_APPLICATION_STATE';
      await txStores.webhooks.markProcessed(
        webhookEventRecordId,
        'IGNORED_OUT_OF_ORDER',
        errorCode,
      );
      return {
        eventId,
        processed: false,
        duplicate: false,
        status: 'IGNORED_OUT_OF_ORDER',
      };
    }

    const existingTxs = await txStores.transactions.findByApplication(currentApp.id);
    if (existingTxs.some((t) => t.type === 'LOAN_DISBURSEMENT' && t.status === 'CONFIRMED')) {
      await txStores.webhooks.markProcessed(
        webhookEventRecordId,
        'IGNORED_OUT_OF_ORDER',
        'ALREADY_DISBURSED',
      );
      return {
        eventId,
        processed: false,
        duplicate: false,
        status: 'IGNORED_OUT_OF_ORDER',
      };
    }

    let app = currentApp;
    const amountPaise = requestedAmountPaise ?? app.requestedAmountPaise;

    if (lenderApp) {
      await txStores.disbursements.record({
        lenderApplicationId: lenderApp.id,
        state: 'DISBURSED',
        amountPaise,
        lenderReference: externalRef ?? null,
        lenderReportedAt: new Date(),
        source: 'LENDER',
      });
    }

    if (app.status === 'CUSTOMER_ACCEPTED_OFFER' || app.status === 'LENDER_FINAL_CONFIRMATION') {
      if (app.status === 'CUSTOMER_ACCEPTED_OFFER') {
        assertTransition('CUSTOMER_ACCEPTED_OFFER', 'LENDER_FINAL_CONFIRMATION', {
          actor: 'SYSTEM',
        });
        app = await txStores.applications.updateStatus({
          id: app.id,
          expectedVersion: app.version,
          toStatus: 'LENDER_FINAL_CONFIRMATION',
          actorType: 'SYSTEM',
        });
      }

      assertTransition('LENDER_FINAL_CONFIRMATION', 'DISBURSEMENT_PENDING', {
        actor: 'LENDER',
        lenderConfirmed: true,
      });
      app = await txStores.applications.updateStatus({
        id: app.id,
        expectedVersion: app.version,
        toStatus: 'DISBURSEMENT_PENDING',
        actorType: 'LENDER',
      });
    }

    assertTransition('DISBURSEMENT_PENDING', 'DISBURSED', {
      actor: 'LENDER',
      lenderConfirmed: true,
    });
    app = await txStores.applications.updateStatus({
      id: app.id,
      expectedVersion: app.version,
      toStatus: 'DISBURSED',
      actorType: 'LENDER',
      terminalAt: new Date(),
      reason: `Lender confirmed disbursement of ${amountPaise} paise`,
    });

    const transaction = await txStores.transactions.create({
      merchantId: app.merchantId,
      applicationId: app.id,
      lenderApplicationId: lenderApp?.id ?? null,
      lenderId,
      type: 'LOAN_DISBURSEMENT',
      status: 'CONFIRMED',
      amountPaise,
      lenderTransactionRef: externalRef ?? null,
      lenderConfirmedAt: new Date(),
      reconciliationStatus: 'MATCHED',
      reconciledAt: new Date(),
    });

    // Accrue 1.5% platform commission through CommissionService inside the transaction
    const commissionPaise = (amountPaise * 150n) / 10000n;
    await this.commissionService.accrue(
      {
        merchantId: app.merchantId,
        applicationId: app.id,
        transactionId: transaction.id,
        amountPaise: commissionPaise,
        ruleCode: 'DEFAULT_STANDARD_1.5PCT',
        ruleSnapshot: { ratePercent: 1.5, calculatedFromPaise: amountPaise.toString() },
        note: 'Platform commission on confirmed disbursement',
      },
      txStores,
    );

    await txStores.webhooks.markProcessed(webhookEventRecordId, 'PROCESSED');

    return {
      eventId,
      processed: true,
      duplicate: false,
      status: 'PROCESSED',
    };
  }

  private async applyDeclineEvent(
    txStores: AppStores,
    webhookEventRecordId: string,
    eventId: string,
    currentApp: FinancingApplicationEntity,
    declineReason: string | undefined,
  ): Promise<WebhookResult> {
    if (!ELIGIBLE_DECLINE_STATUSES.has(currentApp.status)) {
      await txStores.webhooks.markProcessed(
        webhookEventRecordId,
        'IGNORED_OUT_OF_ORDER',
        'INVALID_APPLICATION_STATE',
      );
      return {
        eventId,
        processed: false,
        duplicate: false,
        status: 'IGNORED_OUT_OF_ORDER',
      };
    }

    assertTransition(
      currentApp.status as 'LENDER_PROCESSING' | 'LENDER_FINAL_CONFIRMATION',
      'DECLINED',
      {
        actor: 'LENDER',
        lenderConfirmed: true,
      },
    );
    await txStores.applications.updateStatus({
      id: currentApp.id,
      expectedVersion: currentApp.version,
      toStatus: 'DECLINED',
      actorType: 'LENDER',
      terminalAt: new Date(),
      reason: declineReason ?? 'Lender declined loan via webhook',
    });

    await txStores.webhooks.markProcessed(webhookEventRecordId, 'PROCESSED');

    return {
      eventId,
      processed: true,
      duplicate: false,
      status: 'PROCESSED',
    };
  }

  private async runInTransaction<T>(fn: (txStores: AppStores) => Promise<T>): Promise<T> {
    if (this.stores.runInTransaction) {
      return await this.stores.runInTransaction(fn);
    }
    return await fn(this.stores);
  }

  private async markFailedSafely(webhookEventRecordId: string, err: unknown): Promise<void> {
    const taggedCode =
      typeof err === 'object' && err !== null ? this.errorCodes.get(err) : undefined;
    const errorCode =
      taggedCode ??
      (err instanceof ConflictError
        ? 'CONFLICT'
        : err instanceof NotFoundError
          ? 'NOT_FOUND'
          : err instanceof BadRequestError
            ? 'VALIDATION_ERROR'
            : 'PROCESSING_ERROR');

    try {
      await this.stores.webhooks.markProcessed(webhookEventRecordId, 'FAILED', errorCode);
    } catch {
      // Preserve the original domain error if failure logging itself cannot persist
    }
  }
}
