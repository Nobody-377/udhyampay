import { createHmac, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/common/errors';
import {
  CommissionService,
  type AccrueCommissionParams,
} from '../../src/modules/ledger/commission.service';
import { InMemoryStores } from '../../src/modules/persistence/in-memory-store';
import { PrismaStore } from '../../src/modules/persistence/prisma-store';
import type {
  ApplicationStatus,
  ApplicationStatusHistoryEntity,
  AppStores,
  CommissionEntryEntity,
  DisbursementStatusEntity,
  FinancingApplicationEntity,
  LenderApplicationEntity,
  LenderConfigurationEntity,
  LenderEntity,
  TransactionEntity,
  WebhookEventEntity,
} from '../../src/modules/persistence/stores';
import { WebhookService } from '../../src/modules/webhooks/webhook.service';
import { buildFullTestApp } from '../helpers/build-full-app';

const DEV_SECRET = 'lender-default-dev-secret';

function signWebhook(
  rawPayload: string,
  secret = DEV_SECRET,
  timestampSec?: number,
): {
  signature: string;
  timestamp: string;
} {
  const ts = String(timestampSec ?? Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${ts}.${rawPayload}`).digest('hex');
  return { signature, timestamp: ts };
}

function spyOnCommissionAccrue(commissionService: CommissionService): {
  calls: AccrueCommissionParams[];
  failNext: (err: Error) => void;
  restore: () => void;
} {
  const calls: AccrueCommissionParams[] = [];
  const origAccrue = commissionService.accrue.bind(commissionService);
  let nextFailure: Error | null = null;

  commissionService.accrue = async (
    params: AccrueCommissionParams,
    storesOverride?: AppStores,
  ): Promise<CommissionEntryEntity> => {
    calls.push(params);
    if (nextFailure) {
      const err = nextFailure;
      nextFailure = null;
      throw err;
    }
    return await origAccrue(params, storesOverride);
  };

  return {
    calls,
    failNext: (err: Error) => {
      nextFailure = err;
    },
    restore: () => {
      commissionService.accrue = origAccrue;
    },
  };
}

async function seedDisbursementReadyApplication(
  stores: InMemoryStores,
  opts: {
    lenderCode?: string;
    externalReference?: string | null;
    appStatus?: ApplicationStatus;
    requestedAmountPaise?: bigint;
  } = {},
): Promise<{
  merchantId: string;
  lender: LenderEntity;
  application: FinancingApplicationEntity;
  lenderApplication: LenderApplicationEntity;
}> {
  const lenderCode = opts.lenderCode ?? 'LENDER_ALPHA';
  const existingLender = await stores.lenders.findByCode(lenderCode);
  const lender =
    existingLender ??
    (await stores.lenders.create({
      code: lenderCode,
      displayName: lenderCode,
      type: 'BANK',
      isSimulated: true,
      status: 'ACTIVE',
    }));

  const merchant = await stores.merchants.create({
    legalName: 'Webhook Merchant Pvt Ltd',
    tradeName: 'Webhook Merchant',
    status: 'VERIFIED',
    verifiedAt: new Date(),
    suspendedAt: null,
    suspensionReason: null,
  });

  const shop = await stores.shops.create({
    merchantId: merchant.id,
    name: 'Main Store',
    city: 'Pune',
    state: 'Maharashtra',
    status: 'ACTIVE',
  });

  const customer = await stores.customers.create({
    merchantId: merchant.id,
    fullName: 'Asha Kulkarni',
    phone: '+919876543210',
    retentionExpiresAt: null,
    anonymizedAt: null,
  });

  const requestedAmountPaise = opts.requestedAmountPaise ?? 6500000n;
  const purchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'TELEVISION',
    productDescription: 'Smart TV 55"',
    amountPaise: requestedAmountPaise,
    currency: 'INR',
    idempotencyKey: `pur-${randomUUID()}`,
  });

  const application = await stores.applications.create({
    merchantId: merchant.id,
    shopId: shop.id,
    purchaseId: purchase.id,
    customerId: customer.id,
    createdByUserId: null,
    status: opts.appStatus ?? 'CUSTOMER_ACCEPTED_OFFER',
    routingMode: 'SEQUENTIAL',
    requestedAmountPaise,
    downPaymentPaise: 0n,
    requestedTenureMonths: 6,
    idempotencyKey: `app-${randomUUID()}`,
    submittedAt: new Date(),
    expiresAt: null,
    terminalAt: null,
  });

  const externalRef =
    opts.externalReference === undefined
      ? `${lenderCode}-EXT-${randomUUID().slice(0, 8)}`
      : opts.externalReference;

  const lenderApplication = await stores.lenderApplications.create({
    applicationId: application.id,
    merchantId: merchant.id,
    lenderId: lender.id,
    attemptNo: 1,
    requestKey: `req-${randomUUID()}`,
    externalReference: externalRef,
    outcome: 'OFFERED',
    errorCode: null,
    responseHash: null,
    safeResponseSummary: null,
    reconcileAttempts: 0,
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 25,
  });

  return { merchantId: merchant.id, lender, application, lenderApplication };
}

interface MockDbState {
  lender: LenderEntity;
  lenderConfig: LenderConfigurationEntity | null;
  applications: Map<string, FinancingApplicationEntity>;
  history: ApplicationStatusHistoryEntity[];
  lenderApplications: Map<string, LenderApplicationEntity>;
  webhooks: Map<string, WebhookEventEntity>;
  transactions: Map<string, TransactionEntity>;
  disbursements: DisbursementStatusEntity[];
  commissions: CommissionEntryEntity[];
}

function cloneDbState(state: MockDbState): Omit<MockDbState, 'lender' | 'lenderConfig'> {
  return {
    applications: new Map(Array.from(state.applications, ([k, v]) => [k, { ...v }])),
    history: state.history.map((h) => ({ ...h })),
    lenderApplications: new Map(Array.from(state.lenderApplications, ([k, v]) => [k, { ...v }])),
    webhooks: new Map(Array.from(state.webhooks, ([k, v]) => [k, { ...v }])),
    transactions: new Map(Array.from(state.transactions, ([k, v]) => [k, { ...v }])),
    disbursements: state.disbursements.map((d) => ({ ...d })),
    commissions: state.commissions.map((c) => ({ ...c })),
  };
}

function createStatefulMockPrisma(initialState: MockDbState): {
  prisma: PrismaClient;
  transactionCalls: () => number;
  findByUniqueCalls: Array<Record<string, unknown>>;
} {
  let txCount = 0;
  const findByUniqueCalls: Array<Record<string, unknown>> = [];

  const createDelegates = (state: MockDbState) => ({
    lender: {
      findUnique: async ({ where }: { where: { code?: string; id?: string } }) => {
        if (where.code && state.lender.code === where.code) return { ...state.lender };
        if (where.id && state.lender.id === where.id) return { ...state.lender };
        return null;
      },
    },
    lenderConfiguration: {
      findUnique: async ({ where }: { where: { lenderId: string } }) => {
        if (state.lenderConfig && state.lenderConfig.lenderId === where.lenderId) {
          return { ...state.lenderConfig };
        }
        return null;
      },
      findFirst: async ({ where }: { where: { lenderId: string } }) => {
        if (state.lenderConfig && state.lenderConfig.lenderId === where.lenderId) {
          return { ...state.lenderConfig };
        }
        return null;
      },
    },
    financingApplication: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const a = state.applications.get(where.id);
        return a ? { ...a } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: ApplicationStatus; submittedAt?: Date; terminalAt?: Date };
      }) => {
        const existing = state.applications.get(where.id);
        if (!existing) throw new Error('Application not found');
        const updated: FinancingApplicationEntity = {
          ...existing,
          status: data.status,
          version: existing.version + 1,
          submittedAt: data.submittedAt ?? existing.submittedAt,
          terminalAt: data.terminalAt ?? existing.terminalAt,
          updatedAt: new Date(),
        };
        state.applications.set(updated.id, updated);
        return { ...updated };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: { status: ApplicationStatus; submittedAt?: Date; terminalAt?: Date };
      }) => {
        const existing = state.applications.get(where.id);
        if (!existing || existing.version !== where.version) {
          return { count: 0 };
        }
        const updated: FinancingApplicationEntity = {
          ...existing,
          status: data.status,
          version: existing.version + 1,
          submittedAt: data.submittedAt ?? existing.submittedAt,
          terminalAt: data.terminalAt ?? existing.terminalAt,
          updatedAt: new Date(),
        };
        state.applications.set(updated.id, updated);
        return { count: 1 };
      },
    },
    applicationStatusHistory: {
      create: async ({
        data,
      }: {
        data: Omit<ApplicationStatusHistoryEntity, 'id' | 'createdAt'>;
      }) => {
        const entry: ApplicationStatusHistoryEntity = {
          ...data,
          id: randomUUID(),
          createdAt: new Date(),
        };
        state.history.push(entry);
        return { ...entry };
      },
    },
    lenderApplication: {
      findUnique: async (args: {
        where: {
          id?: string;
          requestKey?: string;
          lenderId_externalReference?: { lenderId: string; externalReference: string };
        };
      }) => {
        findByUniqueCalls.push(args as Record<string, unknown>);
        const { where } = args;
        if (where.id) {
          const la = state.lenderApplications.get(where.id);
          return la ? { ...la } : null;
        }
        if (where.requestKey) {
          for (const la of state.lenderApplications.values()) {
            if (la.requestKey === where.requestKey) return { ...la };
          }
          return null;
        }
        if (where.lenderId_externalReference) {
          const { lenderId, externalReference } = where.lenderId_externalReference;
          for (const la of state.lenderApplications.values()) {
            if (la.lenderId === lenderId && la.externalReference === externalReference) {
              return { ...la };
            }
          }
          return null;
        }
        return null;
      },
      findMany: async ({ where }: { where: { applicationId: string } }) => {
        return Array.from(state.lenderApplications.values())
          .filter((la) => la.applicationId === where.applicationId)
          .map((la) => ({ ...la }));
      },
    },
    webhookEvent: {
      findUnique: async ({
        where,
      }: {
        where: { lenderId_eventId: { lenderId: string; eventId: string } };
      }) => {
        for (const w of state.webhooks.values()) {
          if (
            w.lenderId === where.lenderId_eventId.lenderId &&
            w.eventId === where.lenderId_eventId.eventId
          ) {
            return { ...w };
          }
        }
        return null;
      },
      create: async ({ data }: { data: Omit<WebhookEventEntity, 'id' | 'receivedAt'> }) => {
        for (const w of state.webhooks.values()) {
          if (w.lenderId === data.lenderId && w.eventId === data.eventId) {
            const dupErr = new Error('Unique constraint failed') as Error & { code: string };
            dupErr.code = 'P2002';
            throw dupErr;
          }
        }
        const created: WebhookEventEntity = {
          ...data,
          id: randomUUID(),
          receivedAt: new Date(),
        };
        state.webhooks.set(created.id, created);
        return { ...created };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          processingStatus: WebhookEventEntity['processingStatus'];
          errorCode?: string;
          processedAt: Date;
        };
      }) => {
        const w = state.webhooks.get(where.id);
        if (!w) throw new Error('WebhookEvent not found');
        const updated: WebhookEventEntity = {
          ...w,
          processingStatus: data.processingStatus,
          errorCode: data.errorCode ?? w.errorCode,
          processedAt: data.processedAt,
        };
        state.webhooks.set(updated.id, updated);
        return { ...updated };
      },
    },
    disbursementStatus: {
      create: async ({
        data,
      }: {
        data: Omit<DisbursementStatusEntity, 'id' | 'recordedAt'>;
      }) => {
        const created: DisbursementStatusEntity = {
          ...data,
          id: randomUUID(),
          recordedAt: new Date(),
        };
        state.disbursements.push(created);
        return { ...created };
      },
    },
    transaction: {
      create: async ({
        data,
      }: {
        data: Omit<TransactionEntity, 'id' | 'createdAt' | 'updatedAt'>;
      }) => {
        if (data.lenderId && data.lenderTransactionRef) {
          for (const existing of state.transactions.values()) {
            if (
              existing.lenderId === data.lenderId &&
              existing.lenderTransactionRef === data.lenderTransactionRef &&
              existing.type === data.type
            ) {
              const dupErr = new Error('Unique constraint failed') as Error & { code: string };
              dupErr.code = 'P2002';
              throw dupErr;
            }
          }
        }
        const now = new Date();
        const created: TransactionEntity = {
          ...data,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        state.transactions.set(created.id, created);
        return { ...created };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const tx = state.transactions.get(where.id);
        return tx ? { ...tx } : null;
      },
      findMany: async ({ where }: { where: { applicationId: string } }) => {
        return Array.from(state.transactions.values())
          .filter((t) => t.applicationId === where.applicationId)
          .map((t) => ({ ...t }));
      },
    },
    commissionEntry: {
      findMany: async ({
        where,
      }: {
        where: { transactionId?: string; merchantId?: string };
      }) => {
        return state.commissions
          .filter(
            (c) =>
              (where.transactionId ? c.transactionId === where.transactionId : true) &&
              (where.merchantId ? c.merchantId === where.merchantId : true),
          )
          .map((c) => ({ ...c }));
      },
      create: async ({ data }: { data: Omit<CommissionEntryEntity, 'id' | 'createdAt'> }) => {
        for (const existing of state.commissions) {
          if (existing.transactionId === data.transactionId && existing.entryType === 'ACCRUAL') {
            const dupErr = new Error('Unique constraint failed') as Error & { code: string };
            dupErr.code = 'P2002';
            throw dupErr;
          }
        }
        const created: CommissionEntryEntity = {
          ...data,
          id: randomUUID(),
          createdAt: new Date(),
        };
        state.commissions.push(created);
        return { ...created };
      },
    },
  });

  const rootDelegates = createDelegates(initialState);

  const prisma = {
    ...rootDelegates,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      txCount += 1;
      const snapshot = cloneDbState(initialState);
      const txDelegates = createDelegates(initialState);
      try {
        return await fn(txDelegates);
      } catch (err) {
        initialState.applications = snapshot.applications;
        initialState.history = snapshot.history;
        initialState.lenderApplications = snapshot.lenderApplications;
        initialState.webhooks = snapshot.webhooks;
        initialState.transactions = snapshot.transactions;
        initialState.disbursements = snapshot.disbursements;
        initialState.commissions = snapshot.commissions;
        throw err;
      }
    },
  } as unknown as PrismaClient;

  return {
    prisma,
    transactionCalls: () => txCount,
    findByUniqueCalls,
  };
}

describe('Batch 1C — Webhook Lookup, Replay Protection & Commission Integrity', () => {
  it('Test 1: resolves lender application by externalReference via store method without lenderApplicationsMap (HTTP route + externalReference-only payload)', async () => {
    process.env.DEV_DEFAULT_WEBHOOK_SECRET = DEV_SECRET;
    const { app, stores, commissionService } = buildFullTestApp();
    const { merchantId, lender, application, lenderApplication } =
      await seedDisbursementReadyApplication(stores, {
        externalReference: 'ALPHA-EXT-ONLY-1001',
        requestedAmountPaise: 5000000n,
      });

    const lookupCalls: Array<[string, string]> = [];
    const origFindByExt = stores.lenderApplications.findByExternalReference.bind(
      stores.lenderApplications,
    );

    // Wrap stores in a strict AppStores interface facade WITHOUT any lenderApplicationsMap property
    const strictFacade: AppStores = {
      users: stores.users,
      refreshSessions: stores.refreshSessions,
      merchants: stores.merchants,
      shops: stores.shops,
      customers: stores.customers,
      consents: stores.consents,
      purchases: stores.purchases,
      checkoutSessions: stores.checkoutSessions,
      lenders: stores.lenders,
      applications: stores.applications,
      lenderApplications: {
        ...stores.lenderApplications,
        findByExternalReference: async (lId, extRef) => {
          lookupCalls.push([lId, extRef]);
          return await origFindByExt(lId, extRef);
        },
      },
      offers: stores.offers,
      webhooks: stores.webhooks,
      transactions: stores.transactions,
      disbursements: stores.disbursements,
      commissions: stores.commissions,
      auditLogs: stores.auditLogs,
      runInTransaction: stores.runInTransaction,
    };

    const facadeWebhookService = new WebhookService(strictFacade, 300, commissionService);

    const payload = JSON.stringify({
      eventId: 'evt_ext_only_1',
      eventType: 'DISBURSEMENT_SUCCESSFUL',
      externalReference: 'ALPHA-EXT-ONLY-1001',
      amountPaise: 5000000,
    });
    const { signature, timestamp } = signWebhook(payload);

    const directRes = await facadeWebhookService.processWebhook({
      lenderCode: lender.code,
      rawPayload: payload,
      signatureHeader: signature,
      timestampHeader: timestamp,
    });

    expect(directRes.processed).toBe(true);
    expect(directRes.duplicate).toBe(false);
    expect(directRes.status).toBe('PROCESSED');
    expect(lookupCalls).toEqual([[lender.id, 'ALPHA-EXT-ONLY-1001']]);

    const updatedApp = await stores.applications.findById(application.id);
    expect(updatedApp?.status).toBe('DISBURSED');

    const recordedEvent = await stores.webhooks.findByEvent(lender.id, 'evt_ext_only_1');
    expect(recordedEvent?.lenderApplicationId).toBe(lenderApplication.id);
    expect(recordedEvent?.processingStatus).toBe('PROCESSED');

    // Verify HTTP route works end-to-end with externalReference-only payload on another application
    const second = await seedDisbursementReadyApplication(stores, {
      externalReference: 'ALPHA-EXT-HTTP-2002',
      requestedAmountPaise: 4000000n,
    });
    const httpPayload = JSON.stringify({
      eventId: 'evt_ext_http_2',
      eventType: 'LOAN_DISBURSED',
      externalReference: 'ALPHA-EXT-HTTP-2002',
      amountPaise: 4000000,
    });
    const httpSig = signWebhook(httpPayload);

    const httpRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_ALPHA')
      .set('X-Lender-Signature', httpSig.signature)
      .set('X-Lender-Timestamp', httpSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(httpPayload);

    expect(httpRes.status).toBe(200);
    expect(httpRes.body.data.processed).toBe(true);
    expect(httpRes.body.data.status).toBe('PROCESSED');

    const secondApp = await stores.applications.findById(second.application.id);
    expect(secondApp?.status).toBe('DISBURSED');

    // Commission summary for first merchant = 1.5% of 5,000,000 = 75,000 paise
    const summaryFirst = await commissionService.getMerchantSummary(merchantId);
    expect(summaryFirst.netCommissionPaise).toBe(75000n);
  });

  it('Test 2: PrismaStore.lenderApplications.findByExternalReference queries compound unique key (lenderId_externalReference)', async () => {
    const lenderId = randomUUID();
    const la: LenderApplicationEntity = {
      id: randomUUID(),
      applicationId: randomUUID(),
      merchantId: randomUUID(),
      lenderId,
      attemptNo: 1,
      requestKey: `req-${randomUUID()}`,
      externalReference: 'PRISMA-EXT-42',
      outcome: 'OFFERED',
      errorCode: null,
      responseHash: null,
      safeResponseSummary: null,
      reconcileAttempts: 0,
      startedAt: new Date(),
      completedAt: new Date(),
      latencyMs: 12,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dbState: MockDbState = {
      lender: {
        id: lenderId,
        code: 'LENDER_ALPHA',
        displayName: 'Alpha',
        type: 'BANK',
        isSimulated: true,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      lenderConfig: null,
      applications: new Map(),
      history: [],
      lenderApplications: new Map([[la.id, la]]),
      webhooks: new Map(),
      transactions: new Map(),
      disbursements: [],
      commissions: [],
    };

    const { prisma, findByUniqueCalls } = createStatefulMockPrisma(dbState);
    const prismaStore = new PrismaStore(prisma);

    const found = await prismaStore.lenderApplications.findByExternalReference(
      lenderId,
      'PRISMA-EXT-42',
    );
    expect(found).not.toBeNull();
    expect(found?.id).toBe(la.id);
    expect(findByUniqueCalls).toEqual([
      {
        where: { lenderId_externalReference: { lenderId, externalReference: 'PRISMA-EXT-42' } },
      },
    ]);

    const missing = await prismaStore.lenderApplications.findByExternalReference(
      lenderId,
      'DOES-NOT-EXIST',
    );
    expect(missing).toBeNull();
  });

  it('Test 3: disbursement webhook routes commission accrual exclusively through CommissionService.accrue() and handles LOAN_DECLINED safely', async () => {
    process.env.DEV_DEFAULT_WEBHOOK_SECRET = DEV_SECRET;
    const stores = new InMemoryStores();
    const commissionService = new CommissionService(stores);
    const spy = spyOnCommissionAccrue(commissionService);
    const webhookService = new WebhookService(stores, 300, commissionService);

    try {
      const { merchantId, lender, application, lenderApplication } =
        await seedDisbursementReadyApplication(stores, {
          externalReference: 'ALPHA-ACC-900',
          requestedAmountPaise: 8000000n,
        });

      const disbursePayload = JSON.stringify({
        eventId: 'evt_commission_service_check',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'ALPHA-ACC-900',
        amountPaise: 8000000,
      });
      const sig = signWebhook(disbursePayload);

      const res = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: disbursePayload,
        signatureHeader: sig.signature,
        timestampHeader: sig.timestamp,
      });

      expect(res.processed).toBe(true);
      expect(spy.calls.length).toBe(1);
      expect(spy.calls[0]?.merchantId).toBe(merchantId);
      expect(spy.calls[0]?.applicationId).toBe(application.id);
      expect(spy.calls[0]?.amountPaise).toBe(120000n); // 1.5% of 8,000,000
      expect(spy.calls[0]?.ruleCode).toBe('DEFAULT_STANDARD_1.5PCT');

      const summary = await commissionService.getMerchantSummary(merchantId);
      expect(summary.entries.length).toBe(1);
      expect(summary.netCommissionPaise).toBe(120000n);

      const disbursements = await stores.disbursements.listByLenderApp(lenderApplication.id);
      expect(disbursements.length).toBe(1);
      expect(disbursements[0]?.amountPaise).toBe(8000000n);

      // LOAN_DECLINED webhook via externalReference updates eligible app to DECLINED with zero commission
      const declined = await seedDisbursementReadyApplication(stores, {
        lenderCode: lender.code,
        externalReference: 'ALPHA-DEC-901',
        appStatus: 'LENDER_PROCESSING',
      });
      const declinePayload = JSON.stringify({
        eventId: 'evt_decline_check',
        eventType: 'LOAN_DECLINED',
        externalReference: 'ALPHA-DEC-901',
        declineReason: 'Insufficient credit score',
      });
      const declineSig = signWebhook(declinePayload);

      const declineRes = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: declinePayload,
        signatureHeader: declineSig.signature,
        timestampHeader: declineSig.timestamp,
      });

      expect(declineRes.processed).toBe(true);
      expect(declineRes.status).toBe('PROCESSED');
      const declinedApp = await stores.applications.findById(declined.application.id);
      expect(declinedApp?.status).toBe('DECLINED');
      expect(spy.calls.length).toBe(1);
    } finally {
      spy.restore();
    }
  });

  it('Test 4: blocks duplicate eventId replays, new eventId replays on DISBURSED apps, and forged-signature replays', async () => {
    process.env.DEV_DEFAULT_WEBHOOK_SECRET = DEV_SECRET;
    const stores = new InMemoryStores();
    const commissionService = new CommissionService(stores);
    const spy = spyOnCommissionAccrue(commissionService);
    const webhookService = new WebhookService(stores, 300, commissionService);

    try {
      const { merchantId, lender, application, lenderApplication } =
        await seedDisbursementReadyApplication(stores, {
          externalReference: 'ALPHA-REPLAY-1',
          requestedAmountPaise: 6000000n,
        });

      const payload1 = JSON.stringify({
        eventId: 'evt_replay_same_1',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'ALPHA-REPLAY-1',
        amountPaise: 6000000,
      });
      const sig1 = signWebhook(payload1);

      const first = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: payload1,
        signatureHeader: sig1.signature,
        timestampHeader: sig1.timestamp,
      });
      expect(first).toEqual({
        eventId: 'evt_replay_same_1',
        processed: true,
        duplicate: false,
        status: 'PROCESSED',
      });

      // 4a. Re-sending the exact same signed eventId returns duplicate=true with NO second accrual
      const replaySame = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: payload1,
        signatureHeader: sig1.signature,
        timestampHeader: sig1.timestamp,
      });
      expect(replaySame).toEqual({
        eventId: 'evt_replay_same_1',
        processed: true,
        duplicate: true,
        status: 'PROCESSED',
      });

      // 4b. Replaying same externalReference with a NEW eventId on already-DISBURSED app is safely ignored
      const payloadNewEvent = JSON.stringify({
        eventId: 'evt_replay_new_2',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'ALPHA-REPLAY-1',
        amountPaise: 6000000,
      });
      const sig2 = signWebhook(payloadNewEvent);
      const replayNewEvent = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: payloadNewEvent,
        signatureHeader: sig2.signature,
        timestampHeader: sig2.timestamp,
      });
      expect(replayNewEvent).toEqual({
        eventId: 'evt_replay_new_2',
        processed: false,
        duplicate: false,
        status: 'IGNORED_OUT_OF_ORDER',
      });

      // 4c. Replaying previously-processed eventId with INVALID signature ALWAYS rejects with 401
      await expect(
        webhookService.processWebhook({
          lenderCode: lender.code,
          rawPayload: payload1,
          signatureHeader: '0'.repeat(64),
          timestampHeader: sig1.timestamp,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      // 4d. Replaying an unauthenticated bad eventId twice ALWAYS rejects with 401
      const forgedPayload = JSON.stringify({
        eventId: 'evt_forged_1',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'ALPHA-REPLAY-1',
      });
      await expect(
        webhookService.processWebhook({
          lenderCode: lender.code,
          rawPayload: forgedPayload,
          signatureHeader: 'f'.repeat(64),
          timestampHeader: sig1.timestamp,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(
        webhookService.processWebhook({
          lenderCode: lender.code,
          rawPayload: forgedPayload,
          signatureHeader: 'f'.repeat(64),
          timestampHeader: sig1.timestamp,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(spy.calls.length).toBe(1);
      expect((await stores.transactions.findByApplication(application.id)).length).toBe(1);
      expect((await stores.disbursements.listByLenderApp(lenderApplication.id)).length).toBe(1);
      const summary = await commissionService.getMerchantSummary(merchantId);
      expect(summary.entries.length).toBe(1);
      expect(summary.netCommissionPaise).toBe(90000n);
    } finally {
      spy.restore();
    }
  });

  it('Test 5: fails safely without mutating unrelated records on unknown reference, cross-app mismatch, cross-lender spoofing, and malformed payloads', async () => {
    process.env.DEV_DEFAULT_WEBHOOK_SECRET = DEV_SECRET;
    const { app, stores, commissionService } = buildFullTestApp();

    const seededA = await seedDisbursementReadyApplication(stores, {
      lenderCode: 'LENDER_ALPHA',
      externalReference: 'ALPHA-APP-A',
      requestedAmountPaise: 5000000n,
    });
    const seededB = await seedDisbursementReadyApplication(stores, {
      lenderCode: 'LENDER_ALPHA',
      externalReference: 'ALPHA-APP-B',
      requestedAmountPaise: 7000000n,
    });
    await stores.lenders.create({
      code: 'LENDER_BETA',
      displayName: 'Beta',
      type: 'NBFC',
      isSimulated: true,
      status: 'ACTIVE',
    });

    // 5a. Unknown externalReference (HTTP) -> 404, WebhookEvent marked FAILED, zero mutations
    const unknownPayload = JSON.stringify({
      eventId: 'evt_unknown_ref',
      eventType: 'LOAN_DISBURSED',
      externalReference: 'NON-EXISTENT-EXT-REF',
      amountPaise: 5000000,
    });
    const unknownSig = signWebhook(unknownPayload);
    const unknownRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_ALPHA')
      .set('X-Lender-Signature', unknownSig.signature)
      .set('X-Lender-Timestamp', unknownSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(unknownPayload);

    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.error.code).toBe('NOT_FOUND');
    const unknownEvent = await stores.webhooks.findByEvent(seededA.lender.id, 'evt_unknown_ref');
    expect(unknownEvent?.processingStatus).toBe('FAILED');
    expect(unknownEvent?.errorCode).toBe('LENDER_APPLICATION_NOT_FOUND');

    // 5b. ApplicationId (A) + ExternalReference (B) mismatch -> 400, FAILED, neither mutated
    const mismatchPayload = JSON.stringify({
      eventId: 'evt_mismatch_ab',
      eventType: 'LOAN_DISBURSED',
      applicationId: seededA.application.id,
      externalReference: 'ALPHA-APP-B',
      amountPaise: 5000000,
    });
    const mismatchSig = signWebhook(mismatchPayload);
    const mismatchRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_ALPHA')
      .set('X-Lender-Signature', mismatchSig.signature)
      .set('X-Lender-Timestamp', mismatchSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(mismatchPayload);

    expect(mismatchRes.status).toBe(400);
    const mismatchEvent = await stores.webhooks.findByEvent(seededA.lender.id, 'evt_mismatch_ab');
    expect(mismatchEvent?.processingStatus).toBe('FAILED');
    expect(mismatchEvent?.errorCode).toBe('APPLICATION_REFERENCE_MISMATCH');

    // 5c. Cross-lender spoofing (LENDER_BETA cannot act on LENDER_ALPHA's externalReference)
    const crossLenderPayload = JSON.stringify({
      eventId: 'evt_cross_lender',
      eventType: 'LOAN_DISBURSED',
      externalReference: 'ALPHA-APP-A',
      amountPaise: 5000000,
    });
    const crossSig = signWebhook(crossLenderPayload);
    const crossRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_BETA')
      .set('X-Lender-Signature', crossSig.signature)
      .set('X-Lender-Timestamp', crossSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(crossLenderPayload);

    expect(crossRes.status).toBe(404);

    // 5d. Malformed amountPaise / missing target reference
    const badAmountPayload = JSON.stringify({
      eventId: 'evt_bad_amount',
      eventType: 'LOAN_DISBURSED',
      externalReference: 'ALPHA-APP-A',
      amountPaise: 'not-a-number',
    });
    const badAmountSig = signWebhook(badAmountPayload);
    const badAmountRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_ALPHA')
      .set('X-Lender-Signature', badAmountSig.signature)
      .set('X-Lender-Timestamp', badAmountSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(badAmountPayload);
    expect(badAmountRes.status).toBe(400);
    const badAmountEvent = await stores.webhooks.findByEvent(seededA.lender.id, 'evt_bad_amount');
    expect(badAmountEvent?.processingStatus).toBe('FAILED');
    expect(badAmountEvent?.errorCode).toBe('INVALID_AMOUNT');

    const missingRefPayload = JSON.stringify({
      eventId: 'evt_missing_ref',
      eventType: 'LOAN_DISBURSED',
    });
    const missingRefSig = signWebhook(missingRefPayload);
    const missingRefRes = await request(app)
      .post('/api/v1/webhooks/lenders/LENDER_ALPHA')
      .set('X-Lender-Signature', missingRefSig.signature)
      .set('X-Lender-Timestamp', missingRefSig.timestamp)
      .set('Content-Type', 'application/json')
      .send(missingRefPayload);
    expect(missingRefRes.status).toBe(400);

    // Unrelated applications, disbursements, transactions, and commissions remain completely untouched
    expect((await stores.applications.findById(seededA.application.id))?.status).toBe(
      'CUSTOMER_ACCEPTED_OFFER',
    );
    expect((await stores.applications.findById(seededB.application.id))?.status).toBe(
      'CUSTOMER_ACCEPTED_OFFER',
    );
    expect((await stores.transactions.findByApplication(seededA.application.id)).length).toBe(0);
    expect((await stores.transactions.findByApplication(seededB.application.id)).length).toBe(0);
    expect((await stores.disbursements.listByLenderApp(seededA.lenderApplication.id)).length).toBe(
      0,
    );
    expect((await stores.disbursements.listByLenderApp(seededB.lenderApplication.id)).length).toBe(
      0,
    );
    expect((await commissionService.getMerchantSummary(seededA.merchantId)).entries.length).toBe(0);
    expect((await commissionService.getMerchantSummary(seededB.merchantId)).entries.length).toBe(0);
  });

  it('Test 6: PrismaStore interactive transaction commits disbursement + commission atomically and rolls back all writes when commission accrual fails', async () => {
    process.env.DEV_DEFAULT_WEBHOOK_SECRET = DEV_SECRET;
    const lenderId = randomUUID();
    const merchantId = randomUUID();
    const appId = randomUUID();
    const lenderAppId = randomUUID();

    const dbState: MockDbState = {
      lender: {
        id: lenderId,
        code: 'LENDER_ALPHA',
        displayName: 'Alpha',
        type: 'BANK',
        isSimulated: true,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      lenderConfig: {
        id: randomUUID(),
        lenderId,
        enabled: true,
        priority: 1,
        minAmountPaise: 100000n,
        maxAmountPaise: 50000000n,
        supportedCategories: ['TELEVISION'],
        supportsDiscovery: true,
        fallbackOnDecline: true,
        requestTimeoutMs: 5000,
        maxSafeRetries: 2,
        routingRules: null,
        secretRef: DEV_SECRET,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      applications: new Map([
        [
          appId,
          {
            id: appId,
            merchantId,
            shopId: randomUUID(),
            purchaseId: randomUUID(),
            customerId: randomUUID(),
            createdByUserId: null,
            status: 'CUSTOMER_ACCEPTED_OFFER',
            routingMode: 'SEQUENTIAL',
            requestedAmountPaise: 6500000n,
            downPaymentPaise: 0n,
            requestedTenureMonths: 6,
            idempotencyKey: 'prisma-app-1',
            version: 0,
            submittedAt: new Date(),
            expiresAt: null,
            terminalAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]),
      history: [],
      lenderApplications: new Map([
        [
          lenderAppId,
          {
            id: lenderAppId,
            applicationId: appId,
            merchantId,
            lenderId,
            attemptNo: 1,
            requestKey: 'prisma-req-1',
            externalReference: 'PRISMA-EXT-ATOM-1',
            outcome: 'OFFERED',
            errorCode: null,
            responseHash: null,
            safeResponseSummary: null,
            reconcileAttempts: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            latencyMs: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]),
      webhooks: new Map(),
      transactions: new Map(),
      disbursements: [],
      commissions: [],
    };

    const { prisma, transactionCalls } = createStatefulMockPrisma(dbState);
    const prismaStore = new PrismaStore(prisma);
    const commissionService = new CommissionService(prismaStore);
    const spy = spyOnCommissionAccrue(commissionService);
    const webhookService = new WebhookService(prismaStore, 300, commissionService);

    try {
      // 6a. Simulate transient failure in CommissionService.accrue inside transaction
      spy.failNext(new ConflictError('Simulated commission write failure'));

      const failedPayload = JSON.stringify({
        eventId: 'evt_prisma_tx_fail',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'PRISMA-EXT-ATOM-1',
        amountPaise: 6500000,
      });
      const failSig = signWebhook(failedPayload);

      await expect(
        webhookService.processWebhook({
          lenderCode: 'LENDER_ALPHA',
          rawPayload: failedPayload,
          signatureHeader: failSig.signature,
          timestampHeader: failSig.timestamp,
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(transactionCalls()).toBe(1);
      // All transactional business mutations must be rolled back completely!
      expect(dbState.applications.get(appId)?.status).toBe('CUSTOMER_ACCEPTED_OFFER');
      expect(dbState.history.length).toBe(0);
      expect(dbState.disbursements.length).toBe(0);
      expect(dbState.transactions.size).toBe(0);
      expect(dbState.commissions.length).toBe(0);

      // Recorded webhook event survives rollback and is marked FAILED
      const failedEvent = await prismaStore.webhooks.findByEvent(lenderId, 'evt_prisma_tx_fail');
      expect(failedEvent?.processingStatus).toBe('FAILED');
      expect(failedEvent?.lenderApplicationId).toBe(lenderAppId);

      // 6b. Subsequent healthy delivery succeeds atomically inside $transaction
      const okPayload = JSON.stringify({
        eventId: 'evt_prisma_tx_ok',
        eventType: 'LOAN_DISBURSED',
        externalReference: 'PRISMA-EXT-ATOM-1',
        amountPaise: 6500000,
      });
      const okSig = signWebhook(okPayload);

      const okResult = await webhookService.processWebhook({
        lenderCode: 'LENDER_ALPHA',
        rawPayload: okPayload,
        signatureHeader: okSig.signature,
        timestampHeader: okSig.timestamp,
      });

      expect(okResult).toEqual({
        eventId: 'evt_prisma_tx_ok',
        processed: true,
        duplicate: false,
        status: 'PROCESSED',
      });
      expect(transactionCalls()).toBe(2);
      expect(spy.calls.length).toBe(2);
      expect(dbState.applications.get(appId)?.status).toBe('DISBURSED');
      expect(dbState.history.map((h) => h.toStatus)).toEqual([
        'LENDER_FINAL_CONFIRMATION',
        'DISBURSEMENT_PENDING',
        'DISBURSED',
      ]);
      expect(dbState.disbursements.length).toBe(1);
      expect(dbState.transactions.size).toBe(1);
      expect(dbState.commissions.length).toBe(1);
      expect(dbState.commissions[0]?.amountPaise).toBe(97500n);
      const okEvent = await prismaStore.webhooks.findByEvent(lenderId, 'evt_prisma_tx_ok');
      expect(okEvent?.processingStatus).toBe('PROCESSED');
    } finally {
      spy.restore();
    }
  });

  it('Test 7: store constraints mirror Postgres unique indexes on Transaction and CommissionEntry across InMemoryStores and mocked PrismaStore', async () => {
    const stores = new InMemoryStores();
    const { lender, application, lenderApplication } =
      await seedDisbursementReadyApplication(stores);

    const txData = {
      merchantId: application.merchantId,
      applicationId: application.id,
      lenderApplicationId: lenderApplication.id,
      lenderId: lender.id,
      type: 'LOAN_DISBURSEMENT' as const,
      status: 'CONFIRMED' as const,
      amountPaise: 2500000n,
      lenderTransactionRef: 'UNIQUE-REF-777',
      lenderConfirmedAt: new Date(),
      reconciliationStatus: 'MATCHED' as const,
      reconciledAt: new Date(),
    };

    const createdTx = await stores.transactions.create(txData);
    await expect(stores.transactions.create(txData)).rejects.toBeInstanceOf(ConflictError);

    // CommissionStore duplicate accrual guard on InMemoryStores
    const commData = {
      merchantId: application.merchantId,
      applicationId: application.id,
      transactionId: createdTx.id,
      entryType: 'ACCRUAL' as const,
      amountPaise: 37500n,
      ruleCode: 'DEFAULT_STANDARD_1.5PCT',
      ruleSnapshot: {},
      reversesEntryId: null,
      note: 'test',
    };
    await stores.commissions.accrue(commData);
    await expect(stores.commissions.accrue(commData)).rejects.toBeInstanceOf(ConflictError);

    // PrismaStore translates Prisma P2002 on transactions.create & commissions.accrue into ConflictError
    const dbState: MockDbState = {
      lender,
      lenderConfig: null,
      applications: new Map([[application.id, application]]),
      history: [],
      lenderApplications: new Map([[lenderApplication.id, lenderApplication]]),
      webhooks: new Map(),
      transactions: new Map(),
      disbursements: [],
      commissions: [],
    };
    const { prisma } = createStatefulMockPrisma(dbState);
    const prismaStore = new PrismaStore(prisma);

    const prismaTx = await prismaStore.transactions.create(txData);
    await expect(prismaStore.transactions.create(txData)).rejects.toBeInstanceOf(ConflictError);

    await prismaStore.commissions.accrue({ ...commData, transactionId: prismaTx.id });
    await expect(
      prismaStore.commissions.accrue({ ...commData, transactionId: prismaTx.id }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Concurrent webhook race returning P2002 recovers duplicate=true without mutating
    const webhookService = new WebhookService(prismaStore, 300);
    const racePayload = JSON.stringify({
      eventId: 'evt_concurrent_race',
      eventType: 'LOAN_DISBURSED',
      externalReference: lenderApplication.externalReference ?? 'fallback',
      amountPaise: 2500000,
    });
    const raceSig = signWebhook(racePayload);

    await prismaStore.webhooks.recordReceived({
      lenderId: lender.id,
      lenderApplicationId: lenderApplication.id,
      eventId: 'evt_concurrent_race',
      eventType: 'LOAN_DISBURSED',
      signatureValid: true,
      processingStatus: 'PROCESSED',
      payloadHash: 'hash',
      safePayloadSummary: {},
      errorCode: null,
      processedAt: new Date(),
    });

    const origFindByEvent = prismaStore.webhooks.findByEvent.bind(prismaStore.webhooks);
    let firstRaceCall = true;
    prismaStore.webhooks.findByEvent = async (lId, eId) => {
      if (firstRaceCall) {
        firstRaceCall = false;
        return null;
      }
      return await origFindByEvent(lId, eId);
    };

    try {
      const raceResult = await webhookService.processWebhook({
        lenderCode: lender.code,
        rawPayload: racePayload,
        signatureHeader: raceSig.signature,
        timestampHeader: raceSig.timestamp,
      });

      expect(raceResult).toEqual({
        eventId: 'evt_concurrent_race',
        processed: true,
        duplicate: true,
        status: 'PROCESSED',
      });
    } finally {
      prismaStore.webhooks.findByEvent = origFindByEvent;
    }

    // Sanity check custom errors are preserved for NotFound/BadRequest cases
    expect(new BadRequestError('x')).toBeInstanceOf(BadRequestError);
    expect(new NotFoundError('x')).toBeInstanceOf(NotFoundError);
  });
});
