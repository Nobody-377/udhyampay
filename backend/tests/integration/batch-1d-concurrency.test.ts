import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/common/errors';
import { passwordHasher } from '../../src/modules/auth/password';
import { CircuitBreaker } from '../../src/modules/lenders/circuit-breaker';
import type {
  EligibilityParams,
  EligibilityResult,
  LenderAdapter,
  SubmissionParams,
  SubmissionResult,
} from '../../src/modules/lenders/lender-adapter.interface';
import { OfferService } from '../../src/modules/offers/offer.service';
import { WaterfallOrchestrator } from '../../src/modules/orchestration/waterfall';
import { InMemoryStores } from '../../src/modules/persistence/in-memory-store';
import { PrismaStore } from '../../src/modules/persistence/prisma-store';
import type {
  ApplicationStatusHistoryEntity,
  FinancingApplicationEntity,
  FinancingOfferEntity,
  MerchantEntity,
  OfferStatus,
  PurchaseEntity,
} from '../../src/modules/persistence/stores';
import { buildFullTestApp } from '../helpers/build-full-app';

async function seedVerifiedMerchantFixtures(stores: InMemoryStores, suffix: string) {
  const merchant = await stores.merchants.create({
    legalName: `Merchant ${suffix} Pvt Ltd`,
    tradeName: `Merchant ${suffix}`,
    status: 'VERIFIED',
    verifiedAt: new Date(),
    suspendedAt: null,
    suspensionReason: null,
  });

  const shop1 = await stores.shops.create({
    merchantId: merchant.id,
    name: `Shop ${suffix} A`,
    city: 'Bengaluru',
    state: 'Karnataka',
    status: 'ACTIVE',
  });

  const shop2 = await stores.shops.create({
    merchantId: merchant.id,
    name: `Shop ${suffix} B`,
    city: 'Mumbai',
    state: 'Maharashtra',
    status: 'ACTIVE',
  });

  const customer = await stores.customers.create({
    merchantId: merchant.id,
    fullName: `Customer ${suffix}`,
    phone: '+919999999999',
    retentionExpiresAt: null,
    anonymizedAt: null,
  });

  await stores.consents.create({
    customerId: customer.id,
    merchantId: merchant.id,
    purpose: 'FINANCING_APPLICATION_PROCESSING',
    noticeVersion: 'v1.0',
    captureMethod: 'MERCHANT_ASSISTED',
    grantedAt: new Date(),
    revokedAt: null,
  });

  const passwordHash = await passwordHasher.hash('Password123!');
  await stores.users.create({
    email: `owner-${suffix}@example.com`,
    passwordHash,
    role: 'MERCHANT_OWNER',
    status: 'ACTIVE',
    merchantId: merchant.id,
    tokenVersion: 1,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  });

  return { merchant, shop1, shop2, customer, passwordHash };
}

async function loginMerchant(ctx: ReturnType<typeof buildFullTestApp>, email: string): Promise<string> {
  const res = await request(ctx.app).post('/api/v1/auth/login').send({
    email,
    password: 'Password123!',
  });
  expect(res.status).toBe(200);
  const token = res.body.data?.tokens?.accessToken as string;
  expect(token).toBeTruthy();
  return token;
}

describe('Batch 1D: Atomic Concurrency, Idempotency & Circuit-Breaker Safety', () => {
  describe('Purchase Idempotency & Concurrency (InMemoryStores + HTTP)', () => {
    it('deduplicates concurrent identical POST /purchases calls and preserves a single purchase', async () => {
      const ctx = buildFullTestApp();
      const { merchant, shop1, customer } = await seedVerifiedMerchantFixtures(ctx.stores, 'purch-conc');
      const token = await loginMerchant(ctx, `owner-purch-conc@example.com`);

      const payload = {
        shopId: shop1.id,
        customerId: customer.id,
        productCategory: 'SMARTPHONE',
        productDescription: 'Flagship Phone 256GB',
        amountPaise: '5000000',
        currency: 'INR',
      };

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(ctx.app)
            .post('/api/v1/purchases')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', 'idem-purch-concurrent-001')
            .send(payload),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(201);
        expect(res.body.data.purchase.merchantId).toBe(merchant.id);
      }

      const ids = new Set(responses.map((r) => r.body.data.purchase.id as string));
      expect(ids.size).toBe(1);
      expect(ctx.stores.purchasesMap.size).toBe(1);
    });

    it('rejects idempotency-key reuse with mismatched purchase payload (409) while keeping cross-tenant keys isolated', async () => {
      const ctx = buildFullTestApp();
      const fxA = await seedVerifiedMerchantFixtures(ctx.stores, 'purch-a');
      const fxB = await seedVerifiedMerchantFixtures(ctx.stores, 'purch-b');
      const tokenA = await loginMerchant(ctx, 'owner-purch-a@example.com');
      const tokenB = await loginMerchant(ctx, 'owner-purch-b@example.com');

      const sharedKey = 'shared-idem-key-001';

      const first = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          shopId: fxA.shop1.id,
          customerId: fxA.customer.id,
          productCategory: 'LAPTOP',
          productDescription: 'Workstation',
          amountPaise: '9000000',
        });
      expect(first.status).toBe(201);

      // Reusing same key with modified amount -> 409 Conflict
      const mismatchedAmount = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          shopId: fxA.shop1.id,
          customerId: fxA.customer.id,
          productCategory: 'LAPTOP',
          productDescription: 'Workstation',
          amountPaise: '9500000',
        });
      expect(mismatchedAmount.status).toBe(409);

      // Reusing same key with modified shopId -> 409 Conflict
      const mismatchedShop = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          shopId: fxA.shop2.id,
          customerId: fxA.customer.id,
          productCategory: 'LAPTOP',
          productDescription: 'Workstation',
          amountPaise: '9000000',
        });
      expect(mismatchedShop.status).toBe(409);

      // Merchant B using the exact same Idempotency-Key gets its own isolated purchase
      const merchantBRes = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Idempotency-Key', sharedKey)
        .send({
          shopId: fxB.shop1.id,
          customerId: fxB.customer.id,
          productCategory: 'SMARTPHONE',
          productDescription: 'Phone',
          amountPaise: '3500000',
        });
      expect(merchantBRes.status).toBe(201);
      expect(merchantBRes.body.data.purchase.id).not.toBe(first.body.data.purchase.id);
      expect(ctx.stores.purchasesMap.size).toBe(2);
    });
  });

  describe('PrismaStore Purchase & Application Concurrency (Mocked PG P2002 & CAS Races)', () => {
    it('handles concurrent P2002 race on PrismaStore.purchases.createIdempotent (replays match, rejects mismatch)', async () => {
      const purchases = new Map<string, PurchaseEntity>();
      let findUniqueCount = 0;
      let createCount = 0;

      // Barrier ensures both callers see findUnique -> null before first commits
      let resolveFirstSeenNull!: () => void;
      let barrierArmed = false;
      const bothSawNull = new Promise<void>((resolve) => {
        resolveFirstSeenNull = resolve;
      });

      const mockPrisma = {
        purchase: {
          findUnique: async ({
            where,
          }: {
            where: {
              id?: string;
              merchantId_idempotencyKey?: { merchantId: string; idempotencyKey: string };
            };
          }) => {
            findUniqueCount += 1;
            if (where.id) return purchases.get(where.id) ?? null;
            if (where.merchantId_idempotencyKey) {
              for (const existing of purchases.values()) {
                if (
                  existing.merchantId === where.merchantId_idempotencyKey.merchantId &&
                  existing.idempotencyKey === where.merchantId_idempotencyKey.idempotencyKey
                ) {
                  return existing;
                }
              }
            }
            if (findUniqueCount === 2 && !barrierArmed) {
              barrierArmed = true;
              resolveFirstSeenNull();
            }
            if (findUniqueCount <= 2) {
              await bothSawNull;
            }
            return null;
          },
          create: async ({ data }: { data: Omit<PurchaseEntity, 'id' | 'createdAt' | 'updatedAt'> }) => {
            createCount += 1;
            for (const existing of purchases.values()) {
              if (
                existing.merchantId === data.merchantId &&
                existing.idempotencyKey === data.idempotencyKey
              ) {
                throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
              }
            }
            const created: PurchaseEntity = {
              ...data,
              id: randomUUID(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            purchases.set(created.id, created);
            return created;
          },
        },
      };

      const prismaStore = new PrismaStore(mockPrisma as unknown as PrismaClient);
      const baseData = {
        merchantId: randomUUID(),
        shopId: randomUUID(),
        customerId: randomUUID(),
        productCategory: 'TELEVISION' as const,
        productDescription: 'OLED TV',
        amountPaise: 7000000n,
        currency: 'INR',
        idempotencyKey: 'pg-race-purch-1',
      };

      // Concurrent identical race: first commits, second hits P2002 -> recovers committed entity
      const [r1, r2] = await Promise.all([
        prismaStore.purchases.createIdempotent(baseData),
        prismaStore.purchases.createIdempotent(baseData),
      ]);
      expect(r1.id).toBe(r2.id);
      expect(createCount).toBe(2);
      expect(purchases.size).toBe(1);

      // Subsequent mismatched payload on same key rejects ConflictError
      await expect(
        prismaStore.purchases.createIdempotent({
          ...baseData,
          amountPaise: 7000001n,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('handles P2002 race on PrismaStore.applications.create for both idempotency key and active-purchase index', async () => {
      const applications = new Map<string, FinancingApplicationEntity>();
      const histories: ApplicationStatusHistoryEntity[] = [];
      let findByKeyCalls = 0;

      let resolvePair!: () => void;
      const pairReady = new Promise<void>((resolve) => {
        resolvePair = resolve;
      });

      const makeTxDelegates = (state: { abortOnError: boolean; aborted: boolean }) => ({
        financingApplication: {
          findUnique: async ({
            where,
          }: {
            where: {
              id?: string;
              merchantId_idempotencyKey?: { merchantId: string; idempotencyKey: string };
            };
          }) => {
            if (state.aborted) throw new Error('25P02: current transaction is aborted');
            findByKeyCalls += 1;
            if (where.id) return applications.get(where.id) ?? null;
            if (where.merchantId_idempotencyKey) {
              for (const a of applications.values()) {
                if (
                  a.merchantId === where.merchantId_idempotencyKey.merchantId &&
                  a.idempotencyKey === where.merchantId_idempotencyKey.idempotencyKey
                ) {
                  return a;
                }
              }
            }
            if (findByKeyCalls === 2) resolvePair();
            if (findByKeyCalls <= 2) await pairReady;
            return null;
          },
          findFirst: async ({ where }: { where: { purchaseId: string } }) => {
            if (state.aborted) throw new Error('25P02: current transaction is aborted');
            for (const a of applications.values()) {
              if (a.purchaseId === where.purchaseId && a.status !== 'DECLINED') {
                return a;
              }
            }
            return null;
          },
          create: async ({
            data,
          }: {
            data: Omit<FinancingApplicationEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>;
          }) => {
            if (state.aborted) throw new Error('25P02: current transaction is aborted');
            for (const a of applications.values()) {
              if (a.merchantId === data.merchantId && a.idempotencyKey === data.idempotencyKey) {
                if (state.abortOnError) state.aborted = true;
                throw Object.assign(new Error('Unique idempotency key violation'), { code: 'P2002' });
              }
              if (a.purchaseId === data.purchaseId) {
                if (state.abortOnError) state.aborted = true;
                throw Object.assign(new Error('Unique active purchase violation'), { code: 'P2002' });
              }
            }
            const created: FinancingApplicationEntity = {
              ...data,
              id: randomUUID(),
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            applications.set(created.id, created);
            return created;
          },
        },
        applicationStatusHistory: {
          create: async ({
            data,
          }: {
            data: Omit<ApplicationStatusHistoryEntity, 'id' | 'createdAt'>;
          }) => {
            if (state.aborted) throw new Error('25P02: current transaction is aborted');
            const entry: ApplicationStatusHistoryEntity = {
              ...data,
              id: randomUUID(),
              createdAt: new Date(),
            };
            histories.push(entry);
            return entry;
          },
        },
      });

      const rootDelegates = makeTxDelegates({ abortOnError: false, aborted: false });
      const mockPrisma = {
        ...rootDelegates,
        $transaction: async <T>(fn: (tx: ReturnType<typeof makeTxDelegates>) => Promise<T>): Promise<T> => {
          return fn(makeTxDelegates({ abortOnError: true, aborted: false }));
        },
      };

      const prismaStore = new PrismaStore(mockPrisma as unknown as PrismaClient);
      const baseApp = {
        merchantId: randomUUID(),
        shopId: randomUUID(),
        purchaseId: randomUUID(),
        customerId: randomUUID(),
        createdByUserId: null,
        status: 'CUSTOMER_CONSENT_PENDING' as const,
        routingMode: 'SEQUENTIAL' as const,
        requestedAmountPaise: 4000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'app-pg-race-1',
        submittedAt: null,
        expiresAt: new Date(Date.now() + 86400_000),
        terminalAt: null,
      };

      // Concurrent same-key race recovers cleanly outside aborted transaction
      const [a1, a2] = await Promise.all([
        prismaStore.applications.create(baseApp),
        prismaStore.applications.create(baseApp),
      ]);
      expect(a1.id).toBe(a2.id);
      expect(applications.size).toBe(1);
      expect(histories.length).toBe(1);

      // Reusing key with changed amount rejects ConflictError
      await expect(
        prismaStore.applications.create({
          ...baseApp,
          requestedAmountPaise: 4100000n,
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      // Active-per-purchase unique index violation throws ConflictError cleanly
      await expect(
        prismaStore.applications.create({
          ...baseApp,
          idempotencyKey: 'app-pg-race-different-key',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('enforces atomic conditional CAS (updateMany) on PrismaStore.applications.updateStatus under READ COMMITTED concurrency', async () => {
      const appId = randomUUID();
      const appRow: FinancingApplicationEntity = {
        id: appId,
        merchantId: randomUUID(),
        shopId: randomUUID(),
        purchaseId: randomUUID(),
        customerId: randomUUID(),
        createdByUserId: null,
        status: 'OFFER_AVAILABLE',
        routingMode: 'SEQUENTIAL',
        requestedAmountPaise: 5000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'app-cas-1',
        version: 0,
        submittedAt: new Date(),
        expiresAt: null,
        terminalAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const applications = new Map<string, FinancingApplicationEntity>([[appId, appRow]]);
      const histories: ApplicationStatusHistoryEntity[] = [];

      // Synchronize two concurrent transactions so both read version = 0 before updateMany runs
      let readCount = 0;
      let releaseReads!: () => void;
      const bothReadSameVersion = new Promise<void>((resolve) => {
        releaseReads = resolve;
      });

      interface CasMockPrismaClient {
        financingApplication: {
          findUnique: (args: { where: { id: string } }) => Promise<FinancingApplicationEntity | null>;
          updateMany: (args: {
            where: { id: string; version: number };
            data: { status: FinancingApplicationEntity['status']; version: { increment: number } };
          }) => Promise<{ count: number }>;
        };
        applicationStatusHistory: {
          create: (args: {
            data: Omit<ApplicationStatusHistoryEntity, 'id' | 'createdAt'>;
          }) => Promise<ApplicationStatusHistoryEntity>;
        };
        $transaction: <T>(fn: (tx: CasMockPrismaClient) => Promise<T>) => Promise<T>;
      }

      const mockPrisma: CasMockPrismaClient = {
        financingApplication: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            const found = applications.get(where.id);
            if (!found) return null;
            if (found.version === 0 && readCount < 2) {
              readCount += 1;
              if (readCount === 2) releaseReads();
              await bothReadSameVersion;
            }
            return { ...found };
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: { status: FinancingApplicationEntity['status']; version: { increment: number } };
          }) => {
            const current = applications.get(where.id);
            if (!current || current.version !== where.version) {
              return { count: 0 };
            }
            applications.set(where.id, {
              ...current,
              status: data.status,
              version: current.version + data.version.increment,
              updatedAt: new Date(),
            });
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
            histories.push(entry);
            return entry;
          },
        },
        $transaction: async <T>(fn: (tx: typeof mockPrisma) => Promise<T>): Promise<T> => fn(mockPrisma),
      };

      const prismaStore = new PrismaStore(mockPrisma as unknown as PrismaClient);

      const settled = await Promise.allSettled([
        prismaStore.applications.updateStatus({
          id: appId,
          expectedVersion: 0,
          toStatus: 'CUSTOMER_ACCEPTED_OFFER',
          actorType: 'MERCHANT_USER',
          reason: 'Concurrent update 1',
        }),
        prismaStore.applications.updateStatus({
          id: appId,
          expectedVersion: 0,
          toStatus: 'CANCELLED',
          actorType: 'MERCHANT_USER',
          reason: 'Concurrent update 2',
        }),
      ]);

      const fulfilled = settled.filter((r) => r.status === 'fulfilled');
      const rejected = settled.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      if (rejected[0]?.status === 'rejected') {
        expect(rejected[0].reason).toBeInstanceOf(ConflictError);
      }
      expect(applications.get(appId)?.version).toBe(1);
      expect(histories.length).toBe(1);
    });
  });

  describe('Application Creation & Offer Acceptance Concurrency', () => {
    it('deduplicates concurrent same-key POST /applications, rejects mismatched key payload, and enforces one-active-per-purchase under parallel different keys', async () => {
      const ctx = buildFullTestApp();
      const { shop1, customer } = await seedVerifiedMerchantFixtures(ctx.stores, 'app-conc');
      const token = await loginMerchant(ctx, 'owner-app-conc@example.com');

      const purchRes = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'p-for-apps-1')
        .send({
          shopId: shop1.id,
          customerId: customer.id,
          productCategory: 'REFRIGERATOR',
          productDescription: 'Double Door Fridge',
          amountPaise: '5000000',
        });
      expect(purchRes.status).toBe(201);
      const purchaseId = purchRes.body.data.purchase.id as string;

      // 1. Concurrent same Idempotency-Key -> single application created
      const sameKeyResults = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(ctx.app)
            .post('/api/v1/applications')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', 'app-idem-concurrent-1')
            .send({
              shopId: shop1.id,
              purchaseId,
              customerId: customer.id,
              requestedAmountPaise: '4500000',
              routingMode: 'SEQUENTIAL',
            }),
        ),
      );
      for (const r of sameKeyResults) {
        expect(r.status).toBe(201);
      }
      const sameKeyIds = new Set(sameKeyResults.map((r) => r.body.data.application.id as string));
      expect(sameKeyIds.size).toBe(1);
      expect(ctx.stores.applicationsMap.size).toBe(1);

      // 2. Reusing same Idempotency-Key with different requestedAmountPaise -> 409
      const mismatchRes = await request(ctx.app)
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'app-idem-concurrent-1')
        .send({
          shopId: shop1.id,
          purchaseId,
          customerId: customer.id,
          requestedAmountPaise: '4000000',
          routingMode: 'SEQUENTIAL',
        });
      expect(mismatchRes.status).toBe(409);

      // 3. Second purchase + concurrent DIFFERENT Idempotency-Keys -> exactly 1 succeeds, rest 409
      const purch2Res = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'p-for-apps-2')
        .send({
          shopId: shop1.id,
          customerId: customer.id,
          productCategory: 'WASHING_MACHINE',
          productDescription: 'Washer',
          amountPaise: '4000000',
        });
      expect(purch2Res.status).toBe(201);
      const purchase2Id = purch2Res.body.data.purchase.id as string;

      const diffKeyResults = await Promise.all(
        ['k-race-a', 'k-race-b', 'k-race-c'].map((k) =>
          request(ctx.app)
            .post('/api/v1/applications')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', k)
            .send({
              shopId: shop1.id,
              purchaseId: purchase2Id,
              customerId: customer.id,
              requestedAmountPaise: '3800000',
              routingMode: 'SEQUENTIAL',
            }),
        ),
      );
      const successes = diffKeyResults.filter((r) => r.status === 201);
      const conflicts = diffKeyResults.filter((r) => r.status === 409);
      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(2);
      expect(ctx.stores.applicationsMap.size).toBe(2);
    });

    it('serializes concurrent OfferService.acceptOffer across competing offers via transaction so only one succeeds cleanly', async () => {
      const ctx = buildFullTestApp();
      const { merchant, shop1, customer } = await seedVerifiedMerchantFixtures(ctx.stores, 'offer-conc');
      const token = await loginMerchant(ctx, 'owner-offer-conc@example.com');

      const purchase = await ctx.stores.purchases.createIdempotent({
        merchantId: merchant.id,
        shopId: shop1.id,
        customerId: customer.id,
        productCategory: 'SMARTPHONE',
        productDescription: 'Phone',
        amountPaise: 5000000n,
        currency: 'INR',
        idempotencyKey: 'p-offer-race-1',
      });

      const app = await ctx.stores.applications.create({
        merchantId: merchant.id,
        shopId: shop1.id,
        purchaseId: purchase.id,
        customerId: customer.id,
        createdByUserId: null,
        status: 'OFFER_AVAILABLE',
        routingMode: 'DISCOVERY',
        requestedAmountPaise: 5000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'app-offer-race-1',
        submittedAt: new Date(),
        expiresAt: null,
        terminalAt: null,
      });

      const la1 = await ctx.stores.lenderApplications.create({
        applicationId: app.id,
        merchantId: merchant.id,
        lenderId: randomUUID(),
        attemptNo: 1,
        requestKey: 'la-1',
        externalReference: null,
        outcome: 'OFFERED',
        errorCode: null,
        responseHash: null,
        safeResponseSummary: null,
        reconcileAttempts: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        latencyMs: 50,
      });
      const la2 = await ctx.stores.lenderApplications.create({
        applicationId: app.id,
        merchantId: merchant.id,
        lenderId: randomUUID(),
        attemptNo: 2,
        requestKey: 'la-2',
        externalReference: null,
        outcome: 'OFFERED',
        errorCode: null,
        responseHash: null,
        safeResponseSummary: null,
        reconcileAttempts: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        latencyMs: 60,
      });

      const offer1 = await ctx.stores.offers.create({
        applicationId: app.id,
        lenderApplicationId: la1.id,
        merchantId: merchant.id,
        lenderId: la1.lenderId,
        offerType: 'FIRM_OFFER',
        status: 'ACTIVE',
        lenderOfferReference: 'OFF-1',
        principalPaise: 5000000n,
        downPaymentPaise: 0n,
        tenureMonths: 6,
        interestRatePercent: '12.0',
        rateType: 'REDUCING_BALANCE',
        aprPercent: '12.5',
        emiPaise: 862742n,
        processingFeePaise: 50000n,
        taxesPaise: 9000n,
        otherChargesPaise: 0n,
        totalRepayablePaise: 5176452n,
        repaymentSchedule: null,
        termsVersion: 'v1',
        termsUrl: null,
        expiresAt: new Date(Date.now() + 86400_000),
        isSimulated: true,
      });
      const offer2 = await ctx.stores.offers.create({
        applicationId: app.id,
        lenderApplicationId: la2.id,
        merchantId: merchant.id,
        lenderId: la2.lenderId,
        offerType: 'FIRM_OFFER',
        status: 'ACTIVE',
        lenderOfferReference: 'OFF-2',
        principalPaise: 5000000n,
        downPaymentPaise: 0n,
        tenureMonths: 9,
        interestRatePercent: '14.0',
        rateType: 'REDUCING_BALANCE',
        aprPercent: '14.5',
        emiPaise: 588000n,
        processingFeePaise: 50000n,
        taxesPaise: 9000n,
        otherChargesPaise: 0n,
        totalRepayablePaise: 5292000n,
        repaymentSchedule: null,
        termsVersion: 'v1',
        termsUrl: null,
        expiresAt: new Date(Date.now() + 86400_000),
        isSimulated: true,
      });

      const [res1, res2] = await Promise.all([
        request(ctx.app)
          .post(`/api/v1/applications/${app.id}/offers/${offer1.id}/accept`)
          .set('Authorization', `Bearer ${token}`),
        request(ctx.app)
          .post(`/api/v1/applications/${app.id}/offers/${offer2.id}/accept`)
          .set('Authorization', `Bearer ${token}`),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const finalOffers = await ctx.stores.offers.listByApplication(app.id);
      const acceptedOffers = finalOffers.filter((o) => o.status === 'ACCEPTED');
      const supersededOffers = finalOffers.filter((o) => o.status === 'SUPERSEDED');
      expect(acceptedOffers.length).toBe(1);
      expect(supersededOffers.length).toBe(1);

      const finalApp = await ctx.stores.applications.findById(app.id);
      expect(finalApp?.status).toBe('CUSTOMER_ACCEPTED_OFFER');
      expect(finalApp?.version).toBe(1);
    });

    it('rolls back offer updates in OfferService.acceptOffer if PrismaStore CAS update fails concurrently', async () => {
      const appId = randomUUID();
      const merchantId = randomUUID();
      const offer1Id = randomUUID();
      const offer2Id = randomUUID();

      interface State {
        app: FinancingApplicationEntity;
        offers: Map<string, FinancingOfferEntity>;
        histories: ApplicationStatusHistoryEntity[];
      }

      const persisted: State = {
        app: {
          id: appId,
          merchantId,
          shopId: randomUUID(),
          purchaseId: randomUUID(),
          customerId: randomUUID(),
          createdByUserId: null,
          status: 'OFFER_AVAILABLE',
          routingMode: 'SEQUENTIAL',
          requestedAmountPaise: 5000000n,
          downPaymentPaise: 0n,
          requestedTenureMonths: 6,
          idempotencyKey: 'app-offer-tx',
          version: 0,
          submittedAt: new Date(),
          expiresAt: null,
          terminalAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        offers: new Map([
          [
            offer1Id,
            {
              id: offer1Id,
              applicationId: appId,
              lenderApplicationId: randomUUID(),
              merchantId,
              lenderId: randomUUID(),
              offerType: 'FIRM_OFFER',
              status: 'ACTIVE',
              lenderOfferReference: 'P-OFF-1',
              principalPaise: 5000000n,
              downPaymentPaise: 0n,
              tenureMonths: 6,
              interestRatePercent: '12.0',
              rateType: 'REDUCING_BALANCE',
              aprPercent: '12.5',
              emiPaise: 860000n,
              processingFeePaise: null,
              taxesPaise: null,
              otherChargesPaise: null,
              totalRepayablePaise: null,
              repaymentSchedule: null,
              termsVersion: null,
              termsUrl: null,
              expiresAt: new Date(Date.now() + 86400_000),
              isSimulated: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          [
            offer2Id,
            {
              id: offer2Id,
              applicationId: appId,
              lenderApplicationId: randomUUID(),
              merchantId,
              lenderId: randomUUID(),
              offerType: 'FIRM_OFFER',
              status: 'ACTIVE',
              lenderOfferReference: 'P-OFF-2',
              principalPaise: 5000000n,
              downPaymentPaise: 0n,
              tenureMonths: 12,
              interestRatePercent: '13.0',
              rateType: 'REDUCING_BALANCE',
              aprPercent: '13.5',
              emiPaise: 450000n,
              processingFeePaise: null,
              taxesPaise: null,
              otherChargesPaise: null,
              totalRepayablePaise: null,
              repaymentSchedule: null,
              termsVersion: null,
              termsUrl: null,
              expiresAt: new Date(Date.now() + 86400_000),
              isSimulated: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        ]),
        histories: [],
      };

      const cloneState = (s: State): State => ({
        app: { ...s.app },
        offers: new Map(Array.from(s.offers, ([k, v]) => [k, { ...v }])),
        histories: s.histories.map((h) => ({ ...h })),
      });

      const makeClient = (s: State, forceCasConflictOnUpdate: boolean) => ({
        financingApplication: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            where.id === s.app.id ? { ...s.app } : null,
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: { status: FinancingApplicationEntity['status']; version: { increment: number } };
          }) => {
            if (forceCasConflictOnUpdate || s.app.id !== where.id || s.app.version !== where.version) {
              return { count: 0 };
            }
            s.app = {
              ...s.app,
              status: data.status,
              version: s.app.version + data.version.increment,
              updatedAt: new Date(),
            };
            return { count: 1 };
          },
        },
        financingOffer: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            const o = s.offers.get(where.id);
            return o ? { ...o } : null;
          },
          update: async ({ where, data }: { where: { id: string }; data: { status: OfferStatus } }) => {
            const o = s.offers.get(where.id)!;
            const updated = { ...o, status: data.status, updatedAt: new Date() };
            s.offers.set(where.id, updated);
            return updated;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { applicationId: string; id: { not: string }; status: OfferStatus };
            data: { status: OfferStatus };
          }) => {
            let count = 0;
            for (const [id, o] of s.offers.entries()) {
              if (
                o.applicationId === where.applicationId &&
                id !== where.id.not &&
                o.status === where.status
              ) {
                s.offers.set(id, { ...o, status: data.status, updatedAt: new Date() });
                count += 1;
              }
            }
            return { count };
          },
        },
        applicationStatusHistory: {
          create: async ({
            data,
          }: {
            data: Omit<ApplicationStatusHistoryEntity, 'id' | 'createdAt'>;
          }) => {
            const entry = { ...data, id: randomUUID(), createdAt: new Date() };
            s.histories.push(entry);
            return entry;
          },
        },
      });

      const rootPrisma = {
        ...makeClient(persisted, false),
        $transaction: async <T>(
          fn: (tx: ReturnType<typeof makeClient>) => Promise<T>,
        ): Promise<T> => {
          const staging = cloneState(persisted);
          const result = await fn(makeClient(staging, true));
          persisted.app = staging.app;
          persisted.offers = staging.offers;
          persisted.histories = staging.histories;
          return result;
        },
      };

      const stores = new PrismaStore(rootPrisma as unknown as PrismaClient);
      const offerService = new OfferService(stores);

      await expect(
        offerService.acceptOffer({
          applicationId: appId,
          offerId: offer1Id,
          merchantId,
          actorType: 'MERCHANT_USER',
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      // Both offers must remain ACTIVE after transaction rollback
      expect(persisted.offers.get(offer1Id)?.status).toBe('ACTIVE');
      expect(persisted.offers.get(offer2Id)?.status).toBe('ACTIVE');
      expect(persisted.app.status).toBe('OFFER_AVAILABLE');
    });
  });

  describe('CircuitBreaker Concurrency & Half-Open Trial Protection', () => {
    it('limits HALF_OPEN probes to a single concurrent trial and ignores stale-epoch failures', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 25,
        halfOpenSuccessThreshold: 2,
        maxHalfOpenConcurrent: 1,
      });

      // Acquire two in-flight permits in epoch 0, then trip with 2 fresh failures
      const stalePermit = cb.tryAcquire();
      const staleSuccessPermit = cb.tryAcquire();
      expect(stalePermit.allowed).toBe(true);
      expect(staleSuccessPermit.allowed).toBe(true);

      const p1 = cb.tryAcquire();
      const p2 = cb.tryAcquire();
      p1.recordFailure();
      p2.recordFailure();
      expect(cb.getState()).toBe('OPEN');
      expect(cb.canExecute()).toBe(false);

      // Late failure from stale CLOSED epoch must NOT prolong OPEN or affect future HALF_OPEN
      stalePermit.recordFailure();
      expect(cb.tryAcquire().allowed).toBe(false);

      await new Promise((r) => setTimeout(r, 40));
      expect(cb.getState()).toBe('HALF_OPEN');

      // Stale permits from epoch 0 must NOT advance or trip the new HALF_OPEN epoch
      staleSuccessPermit.recordSuccess();
      stalePermit.recordFailure();
      expect(cb.getState()).toBe('HALF_OPEN');

      // Only 1 HALF_OPEN probe permit may be active concurrently
      const probes = Array.from({ length: 5 }, () => cb.tryAcquire());
      const allowedProbes = probes.filter((p) => p.allowed);
      const rejectedProbes = probes.filter((p) => !p.allowed);
      expect(allowedProbes.length).toBe(1);
      expect(rejectedProbes.length).toBe(4);
      expect(cb.canExecute()).toBe(false);

      // Release via recordSuccess (1 of 2), then second sequential probe recovers to CLOSED
      allowedProbes[0]!.recordSuccess();
      expect(cb.getState()).toBe('HALF_OPEN');
      expect(cb.canExecute()).toBe(true);

      const secondProbe = cb.tryAcquire();
      expect(secondProbe.allowed).toBe(true);
      secondProbe.recordSuccess();
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.canExecute()).toBe(true);
    });

    it('releases HALF_OPEN trial slot cleanly via idempotent release() on unexpected throw', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 20,
        halfOpenSuccessThreshold: 1,
        maxHalfOpenConcurrent: 1,
      });

      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');

      await new Promise((r) => setTimeout(r, 30));
      const permit = cb.tryAcquire();
      expect(permit.allowed).toBe(true);
      expect(cb.canExecute()).toBe(false);

      // Even if caller only runs finally { permit.release() }, slot must not leak
      permit.release();
      permit.release();
      expect(cb.getState()).toBe('HALF_OPEN');
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe('WaterfallOrchestrator DISCOVERY Concurrency & Breaker Isolation', () => {
    it('persists offers from multiple concurrent lenders in DISCOVERY mode without ConflictError or false breaker trips', async () => {
      const stores = new InMemoryStores();
      const m: MerchantEntity = await stores.merchants.create({
        legalName: 'Disc Merchant',
        tradeName: 'Disc',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        suspendedAt: null,
        suspensionReason: null,
      });
      const shop = await stores.shops.create({
        merchantId: m.id,
        name: 'Main',
        city: 'BLR',
        state: 'KA',
        status: 'ACTIVE',
      });
      const customer = await stores.customers.create({
        merchantId: m.id,
        fullName: 'Rohan',
        phone: '+919999999999',
        retentionExpiresAt: null,
        anonymizedAt: null,
      });
      const purchase = await stores.purchases.createIdempotent({
        merchantId: m.id,
        shopId: shop.id,
        customerId: customer.id,
        productCategory: 'LAPTOP',
        productDescription: 'Laptop',
        amountPaise: 8000000n,
        currency: 'INR',
        idempotencyKey: 'disc-multi-p1',
      });

      const lenderCodes = ['LENDER_ONE', 'LENDER_TWO', 'LENDER_THREE'] as const;
      for (let i = 0; i < lenderCodes.length; i++) {
        const code = lenderCodes[i]!;
        const lender = await stores.lenders.create({
          code,
          displayName: code,
          type: 'NBFC',
          isSimulated: true,
          status: 'ACTIVE',
        });
        await stores.lenders.saveConfig({
          lenderId: lender.id,
          enabled: true,
          priority: (i + 1) * 10,
          minAmountPaise: null,
          maxAmountPaise: null,
          supportedCategories: [],
          supportsDiscovery: true,
          fallbackOnDecline: true,
          requestTimeoutMs: 5000,
          maxSafeRetries: 0,
          routingRules: null,
          secretRef: null,
          updatedByUserId: null,
        });
      }

      const app = await stores.applications.create({
        merchantId: m.id,
        shopId: shop.id,
        purchaseId: purchase.id,
        customerId: customer.id,
        createdByUserId: null,
        status: 'SUBMITTED',
        routingMode: 'DISCOVERY',
        requestedAmountPaise: 8000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 12,
        idempotencyKey: 'disc-multi-app1',
        submittedAt: new Date(),
        expiresAt: null,
        terminalAt: null,
      });

      const breakers = new Map<string, CircuitBreaker>();
      const adapters = new Map<string, LenderAdapter>();
      const startedCodes: string[] = [];
      let releaseAll!: () => void;
      const allStartedGate = new Promise<void>((resolve) => {
        releaseAll = resolve;
      });

      for (const code of lenderCodes) {
        breakers.set(code, new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30000 }));
        const adapter: LenderAdapter = {
          code,
          displayName: code,
          async checkEligibility(_params: EligibilityParams): Promise<EligibilityResult> {
            return { eligible: true };
          },
          async submitApplication(params: SubmissionParams): Promise<SubmissionResult> {
            startedCodes.push(code);
            if (startedCodes.length === lenderCodes.length) {
              releaseAll();
            }
            await allStartedGate;
            return {
              outcome: 'OFFERED',
              externalReference: `${code}-${params.requestKey}`,
              offers: [
                {
                  lenderOfferReference: `OFF-${code}-${params.requestKey}`,
                  principalPaise: 8000000n,
                  tenureMonths: 12,
                  interestRatePercent: '12.5',
                  rateType: 'REDUCING_BALANCE',
                  aprPercent: '13.0',
                  emiPaise: 712663n,
                },
              ],
            };
          },
        };
        adapters.set(code, adapter);
      }

      const orchestrator = new WaterfallOrchestrator(stores, adapters, { circuitBreakers: breakers });
      const finalApp = await orchestrator.execute(app.id);

      expect(finalApp.status).toBe('OFFER_AVAILABLE');
      expect(finalApp.version).toBe(2);

      const savedOffers = await stores.offers.listByApplication(app.id);
      expect(savedOffers.length).toBe(3);

      const attempts = await stores.lenderApplications.listByApplication(app.id);
      expect(attempts.length).toBe(3);
      for (const attempt of attempts) {
        expect(attempt.outcome).toBe('OFFERED');
      }

      // Every healthy lender breaker must remain CLOSED and usable
      for (const code of lenderCodes) {
        const b = breakers.get(code)!;
        expect(b.getState()).toBe('CLOSED');
        expect(b.canExecute()).toBe(true);
      }
    });

    it('isolates mixed DISCOVERY outcomes (OFFERED + DECLINED + UNAVAILABLE) and trips only the failing breaker', async () => {
      const stores = new InMemoryStores();
      const m = await stores.merchants.create({
        legalName: 'Mixed Disc Merchant',
        tradeName: 'Mixed Disc',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        suspendedAt: null,
        suspensionReason: null,
      });
      const shop = await stores.shops.create({
        merchantId: m.id,
        name: 'Shop 1',
        city: 'BLR',
        state: 'KA',
        status: 'ACTIVE',
      });
      const customer = await stores.customers.create({
        merchantId: m.id,
        fullName: 'Meera',
        phone: '+919999999999',
        retentionExpiresAt: null,
        anonymizedAt: null,
      });
      const purchase = await stores.purchases.createIdempotent({
        merchantId: m.id,
        shopId: shop.id,
        customerId: customer.id,
        productCategory: 'TELEVISION',
        productDescription: 'TV',
        amountPaise: 6000000n,
        currency: 'INR',
        idempotencyKey: 'mixed-disc-p1',
      });

      const setupLender = async (code: string, priority: number) => {
        const lender = await stores.lenders.create({
          code,
          displayName: code,
          type: 'NBFC',
          isSimulated: true,
          status: 'ACTIVE',
        });
        await stores.lenders.saveConfig({
          lenderId: lender.id,
          enabled: true,
          priority,
          minAmountPaise: null,
          maxAmountPaise: null,
          supportedCategories: [],
          supportsDiscovery: true,
          fallbackOnDecline: true,
          requestTimeoutMs: 2000,
          maxSafeRetries: 0,
          routingRules: null,
          secretRef: null,
          updatedByUserId: null,
        });
        return lender;
      };

      const lOffer = await setupLender('L_OFFER', 10);
      const lDecline = await setupLender('L_DECLINE', 20);
      const lFail = await setupLender('L_FAIL', 30);

      const app = await stores.applications.create({
        merchantId: m.id,
        shopId: shop.id,
        purchaseId: purchase.id,
        customerId: customer.id,
        createdByUserId: null,
        status: 'SUBMITTED',
        routingMode: 'DISCOVERY',
        requestedAmountPaise: 6000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'mixed-disc-app1',
        submittedAt: new Date(),
        expiresAt: null,
        terminalAt: null,
      });

      const breakers = new Map<string, CircuitBreaker>([
        ['L_OFFER', new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30000 })],
        ['L_DECLINE', new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30000 })],
        ['L_FAIL', new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 30000 })],
      ]);

      const adapters = new Map<string, LenderAdapter>([
        [
          'L_OFFER',
          {
            code: 'L_OFFER',
            displayName: 'Offer',
            checkEligibility: async () => ({ eligible: true }),
            submitApplication: async (p) => ({
              outcome: 'OFFERED',
              externalReference: `EXT-O-${p.requestKey}`,
              offers: [
                {
                  lenderOfferReference: `OFF-${p.requestKey}`,
                  principalPaise: 6000000n,
                  tenureMonths: 6,
                  interestRatePercent: '12.0',
                  rateType: 'REDUCING_BALANCE',
                  aprPercent: '12.5',
                  emiPaise: 1035290n,
                },
              ],
            }),
          },
        ],
        [
          'L_DECLINE',
          {
            code: 'L_DECLINE',
            displayName: 'Decline',
            checkEligibility: async () => ({ eligible: true }),
            submitApplication: async () => ({
              outcome: 'DECLINED',
              errorCode: 'CREDIT_POLICY_DECLINED',
            }),
          },
        ],
        [
          'L_FAIL',
          {
            code: 'L_FAIL',
            displayName: 'Fail',
            checkEligibility: async () => ({ eligible: true }),
            submitApplication: async () => {
              throw new Error('Upstream 503');
            },
          },
        ],
      ]);

      const orchestrator = new WaterfallOrchestrator(stores, adapters, { circuitBreakers: breakers });
      const finalApp = await orchestrator.execute(app.id);

      expect(finalApp.status).toBe('OFFER_AVAILABLE');

      const attempts = await stores.lenderApplications.listByApplication(app.id);
      expect(attempts.length).toBe(3);
      expect(attempts.find((a) => a.lenderId === lOffer.id)?.outcome).toBe('OFFERED');
      expect(attempts.find((a) => a.lenderId === lDecline.id)?.outcome).toBe('DECLINED');
      expect(attempts.find((a) => a.lenderId === lFail.id)?.outcome).toBe('UNAVAILABLE');

      expect(breakers.get('L_OFFER')?.getState()).toBe('CLOSED');
      expect(breakers.get('L_DECLINE')?.getState()).toBe('CLOSED');
      expect(breakers.get('L_FAIL')?.getState()).toBe('OPEN');
    });

    it('permits only one HALF_OPEN probe across concurrent WaterfallOrchestrator runs', async () => {
      const stores = new InMemoryStores();
      const m = await stores.merchants.create({
        legalName: 'HO Merchant',
        tradeName: 'HO',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        suspendedAt: null,
        suspensionReason: null,
      });
      const shop = await stores.shops.create({
        merchantId: m.id,
        name: 'Main',
        city: 'BLR',
        state: 'KA',
        status: 'ACTIVE',
      });
      const customer = await stores.customers.create({
        merchantId: m.id,
        fullName: 'Anita',
        phone: '+919999999999',
        retentionExpiresAt: null,
        anonymizedAt: null,
      });

      const lender = await stores.lenders.create({
        code: 'L_HO',
        displayName: 'HalfOpen Lender',
        type: 'BANK',
        isSimulated: true,
        status: 'ACTIVE',
      });
      await stores.lenders.saveConfig({
        lenderId: lender.id,
        enabled: true,
        priority: 10,
        minAmountPaise: null,
        maxAmountPaise: null,
        supportedCategories: [],
        supportsDiscovery: false,
        fallbackOnDecline: true,
        requestTimeoutMs: 3000,
        maxSafeRetries: 0,
        routingRules: null,
        secretRef: null,
        updatedByUserId: null,
      });

      const makeSubmittedApp = async (key: string) => {
        const p = await stores.purchases.createIdempotent({
          merchantId: m.id,
          shopId: shop.id,
          customerId: customer.id,
          productCategory: 'SMARTPHONE',
          productDescription: 'Phone',
          amountPaise: 3000000n,
          currency: 'INR',
          idempotencyKey: `p-${key}`,
        });
        return stores.applications.create({
          merchantId: m.id,
          shopId: shop.id,
          purchaseId: p.id,
          customerId: customer.id,
          createdByUserId: null,
          status: 'SUBMITTED',
          routingMode: 'SEQUENTIAL',
          requestedAmountPaise: 3000000n,
          downPaymentPaise: 0n,
          requestedTenureMonths: 6,
          idempotencyKey: key,
          submittedAt: new Date(),
          expiresAt: null,
          terminalAt: null,
        });
      };

      const appA = await makeSubmittedApp('ho-app-a');
      const appB = await makeSubmittedApp('ho-app-b');

      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 20,
        halfOpenSuccessThreshold: 1,
        maxHalfOpenConcurrent: 1,
      });
      breaker.recordFailure(); // OPEN
      await new Promise((r) => setTimeout(r, 35)); // now HALF_OPEN

      let adapterInvocations = 0;
      let releaseProbe!: () => void;
      let probeEntered!: () => void;
      const probeGate = new Promise<void>((resolve) => {
        releaseProbe = resolve;
      });
      const probeStarted = new Promise<void>((resolve) => {
        probeEntered = resolve;
      });

      const adapters = new Map<string, LenderAdapter>([
        [
          'L_HO',
          {
            code: 'L_HO',
            displayName: 'HalfOpen Lender',
            checkEligibility: async () => ({ eligible: true }),
            submitApplication: async (p) => {
              adapterInvocations += 1;
              probeEntered();
              await probeGate;
              return {
                outcome: 'OFFERED',
                externalReference: `EXT-${p.requestKey}`,
                offers: [
                  {
                    lenderOfferReference: `OFF-${p.requestKey}`,
                    principalPaise: 3000000n,
                    tenureMonths: 6,
                    interestRatePercent: '12.0',
                    rateType: 'REDUCING_BALANCE',
                    aprPercent: '12.5',
                    emiPaise: 517645n,
                  },
                ],
              };
            },
          },
        ],
      ]);

      const orchestrator = new WaterfallOrchestrator(stores, adapters, {
        circuitBreakers: new Map([['L_HO', breaker]]),
      });

      const runAPromise = orchestrator.execute(appA.id);
      await probeStarted;
      const finalB = await orchestrator.execute(appB.id);
      releaseProbe();

      const finalA = await runAPromise;

      expect(adapterInvocations).toBe(1);
      expect(finalA.status).toBe('OFFER_AVAILABLE');
      expect(finalB.status).toBe('TECHNICAL_FAILURE');

      const attemptsB = await stores.lenderApplications.listByApplication(appB.id);
      expect(attemptsB[0]?.errorCode).toBe('CIRCUIT_BREAKER_OPEN');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });
});
