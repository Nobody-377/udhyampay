import type { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { parseEnv } from '../../src/config/env';
import { AdminService } from '../../src/modules/admin/admin.service';
import { InvalidStateTransitionError } from '../../src/modules/applications/application-state-machine';
import { ApplicationService } from '../../src/modules/applications/application.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { passwordHasher } from '../../src/modules/auth/password';
import { CheckoutService } from '../../src/modules/checkout/checkout.service';
import { CommissionService } from '../../src/modules/ledger/commission.service';
import { OfferService } from '../../src/modules/offers/offer.service';
import type { InMemoryStores } from '../../src/modules/persistence/in-memory-store';
import { PrismaStore } from '../../src/modules/persistence/prisma-store';
import type {
  ApplicationStatusHistoryEntity,
  CommissionEntryEntity,
  CustomerEntity,
  FinancingApplicationEntity,
  FinancingOfferEntity,
  MerchantEntity,
  PurchaseEntity,
  UserEntity,
  UserRole,
} from '../../src/modules/persistence/stores';
import { WebhookService } from '../../src/modules/webhooks/webhook.service';
import { buildFullTestApp } from '../helpers/build-full-app';

async function createAndLoginUser(
  stores: InMemoryStores,
  authService: AuthService,
  params: {
    email: string;
    role: UserRole;
    merchantId: string | null;
    status?: 'ACTIVE' | 'SUSPENDED';
  },
): Promise<{ user: UserEntity; accessToken: string; refreshToken: string | null }> {
  const password = 'Password123!';
  const passwordHash = await passwordHasher.hash(password);
  const user = await stores.users.create({
    email: params.email,
    passwordHash,
    role: params.role,
    status: params.status ?? 'ACTIVE',
    merchantId: params.merchantId,
    tokenVersion: 1,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  });

  if (user.status === 'ACTIVE') {
    const loggedIn = await authService.login({ email: params.email, password });
    return {
      user,
      accessToken: loggedIn.tokens.accessToken,
      refreshToken: loggedIn.tokens.refreshToken,
    };
  }

  const accessToken = authService.getTokenService().signAccessToken({
    userId: user.id,
    role: user.role,
    merchantId: user.merchantId,
    tokenVersion: user.tokenVersion,
  });
  return { user, accessToken, refreshToken: null };
}

async function seedMerchantResources(
  stores: InMemoryStores,
  suffix: string,
): Promise<{
  merchantId: string;
  shopId: string;
  customerId: string;
  purchaseId: string;
  draftAppId: string;
  cancelableAppId: string;
  offerAppId: string;
  offerId: string;
  consentId: string;
}> {
  const merchant = await stores.merchants.create({
    legalName: `Merchant Legal ${suffix}`,
    tradeName: `Merchant ${suffix}`,
    status: 'VERIFIED',
    verifiedAt: new Date(),
    suspendedAt: null,
    suspensionReason: null,
  });

  const shop = await stores.shops.create({
    merchantId: merchant.id,
    name: `Shop ${suffix}`,
    city: 'Bengaluru',
    state: 'Karnataka',
    status: 'ACTIVE',
  });

  const customer = await stores.customers.create({
    merchantId: merchant.id,
    fullName: `Customer ${suffix}`,
    phone: `+919800000${suffix.padStart(3, '0').slice(-3)}`,
    retentionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    anonymizedAt: null,
  });

  const consent = await stores.consents.create({
    merchantId: merchant.id,
    customerId: customer.id,
    purpose: 'FINANCING_APPLICATION_PROCESSING',
    noticeVersion: 'v1.0',
    captureMethod: 'CUSTOMER_CHECKOUT_SESSION',
    grantedAt: new Date(),
    revokedAt: null,
  });

  const purchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Device ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purchase-${suffix}`,
  });

  const cancelPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Device Cancel ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purchase-cancel-${suffix}`,
  });

  const offerPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Device Offer ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purchase-offer-${suffix}`,
  });

  const draftApp = await stores.applications.create({
    merchantId: merchant.id,
    shopId: shop.id,
    purchaseId: purchase.id,
    customerId: customer.id,
    createdByUserId: null,
    status: 'CUSTOMER_CONSENT_PENDING',
    routingMode: 'SEQUENTIAL',
    requestedAmountPaise: 3000000n,
    downPaymentPaise: 0n,
    requestedTenureMonths: 6,
    idempotencyKey: `app-draft-${suffix}`,
    submittedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    terminalAt: null,
  });

  const cancelableApp = await stores.applications.create({
    merchantId: merchant.id,
    shopId: shop.id,
    purchaseId: cancelPurchase.id,
    customerId: customer.id,
    createdByUserId: null,
    status: 'CUSTOMER_CONSENT_PENDING',
    routingMode: 'SEQUENTIAL',
    requestedAmountPaise: 3000000n,
    downPaymentPaise: 0n,
    requestedTenureMonths: 6,
    idempotencyKey: `app-cancel-${suffix}`,
    submittedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    terminalAt: null,
  });

  const lender =
    (await stores.lenders.findByCode('LENDER_ALPHA')) ??
    (await stores.lenders.create({
      code: 'LENDER_ALPHA',
      displayName: 'Alpha Digital Bank',
      type: 'BANK',
      isSimulated: true,
      status: 'ACTIVE',
    }));

  await stores.lenders.saveConfig({
    lenderId: lender.id,
    enabled: true,
    priority: 1,
    minAmountPaise: null,
    maxAmountPaise: null,
    supportedCategories: ['SMARTPHONE'],
    supportsDiscovery: true,
    fallbackOnDecline: true,
    requestTimeoutMs: 5000,
    maxSafeRetries: 1,
    routingRules: null,
    secretRef: null,
    updatedByUserId: null,
  });

  const offerApp = await stores.applications.create({
    merchantId: merchant.id,
    shopId: shop.id,
    purchaseId: offerPurchase.id,
    customerId: customer.id,
    createdByUserId: null,
    status: 'OFFER_AVAILABLE',
    routingMode: 'SEQUENTIAL',
    requestedAmountPaise: 3000000n,
    downPaymentPaise: 0n,
    requestedTenureMonths: 6,
    idempotencyKey: `app-offer-${suffix}`,
    submittedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    terminalAt: null,
  });

  const lenderAttempt = await stores.lenderApplications.create({
    applicationId: offerApp.id,
    merchantId: merchant.id,
    lenderId: lender.id,
    attemptNo: 1,
    requestKey: `req-${suffix}-${offerApp.id}`,
    externalReference: `EXT-${suffix}`,
    outcome: 'OFFERED',
    errorCode: null,
    responseHash: null,
    safeResponseSummary: null,
    reconcileAttempts: 0,
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 10,
  });

  const offer = await stores.offers.create({
    applicationId: offerApp.id,
    lenderApplicationId: lenderAttempt.id,
    merchantId: merchant.id,
    lenderId: lender.id,
    offerType: 'FIRM_OFFER',
    status: 'ACTIVE',
    lenderOfferReference: `OFFER-REF-${suffix}`,
    principalPaise: 3000000n,
    downPaymentPaise: 0n,
    tenureMonths: 6,
    interestRatePercent: '12.0',
    rateType: 'REDUCING_BALANCE',
    aprPercent: '12.5',
    emiPaise: 517645n,
    processingFeePaise: 0n,
    taxesPaise: 0n,
    otherChargesPaise: 0n,
    totalRepayablePaise: 3105870n,
    repaymentSchedule: null,
    termsVersion: 'v1',
    termsUrl: null,
    expiresAt: new Date(Date.now() + 86400000),
    isSimulated: true,
  });

  return {
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    purchaseId: purchase.id,
    draftAppId: draftApp.id,
    cancelableAppId: cancelableApp.id,
    offerAppId: offerApp.id,
    offerId: offer.id,
    consentId: consent.id,
  };
}

describe('Batch 1A: Authentication, /auth/me, RBAC & Tenant Enforcement', () => {
  describe('GET /api/v1/auth/me', () => {
    it('rejects unauthenticated, malformed, non-UUID sub, revoked, and suspended tokens with 401', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, '01');
      const { user, accessToken, refreshToken } = await createAndLoginUser(stores, authService, {
        email: 'me-owner@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: fixture.merchantId,
      });

      const unauth = await request(app).get('/api/v1/auth/me');
      expect(unauth.status).toBe(401);

      const badJwt = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-valid-jwt');
      expect(badJwt.status).toBe(401);

      let findByIdCalls = 0;
      const originalFindById = stores.users.findById;
      stores.users.findById = async (id: string) => {
        findByIdCalls += 1;
        return originalFindById(id);
      };
      try {
        const malformedSubJwt = authService.getTokenService().signAccessToken({
          userId: 'not-a-uuid',
          role: 'MERCHANT_OWNER',
          merchantId: fixture.merchantId,
          tokenVersion: 1,
        });
        const malformedSubRes = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${malformedSubJwt}`);
        expect(malformedSubRes.status).toBe(401);
        expect(findByIdCalls).toBe(0);
      } finally {
        stores.users.findById = originalFindById;
      }

      // Existing logout behavior revokes the refresh session without modifying tokenVersion
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken });
      expect(logoutRes.status).toBe(200);
      expect((await stores.users.findById(user.id))?.tokenVersion).toBe(1);

      // Incrementing tokenVersion immediately invalidates existing access tokens on /auth/me
      await stores.users.incrementTokenVersion(user.id);
      expect((await stores.users.findById(user.id))?.tokenVersion).toBe(2);
      const revokedRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(revokedRes.status).toBe(401);

      // Refreshing with the logged-out token fails with 401 and triggers reuse tokenVersion bump
      const refreshAfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(refreshAfterLogout.status).toBe(401);

      const suspended = await createAndLoginUser(stores, authService, {
        email: 'suspended@example.com',
        role: 'MERCHANT_STAFF',
        merchantId: fixture.merchantId,
        status: 'SUSPENDED',
      });
      const suspendedRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${suspended.accessToken}`);
      expect(suspendedRes.status).toBe(401);

      const freshUser = await stores.users.findById(user.id);
      expect(freshUser?.tokenVersion).toBe(3);
    });

    it('returns exact { id, email, role, merchantId } without tokenVersion for authenticated users', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, '02');
      const owner = await createAndLoginUser(stores, authService, {
        email: 'owner-me@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: fixture.merchantId,
      });
      const admin = await createAndLoginUser(stores, authService, {
        email: 'admin-me@example.com',
        role: 'ADMIN',
        merchantId: null,
      });

      const ownerRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data.user).toEqual({
        id: owner.user.id,
        email: 'owner-me@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: fixture.merchantId,
      });
      expect(Object.keys(ownerRes.body.data.user).sort()).toEqual([
        'email',
        'id',
        'merchantId',
        'role',
      ]);
      expect(ownerRes.body.data.user.tokenVersion).toBeUndefined();

      const adminRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.user).toEqual({
        id: admin.user.id,
        email: 'admin-me@example.com',
        role: 'ADMIN',
        merchantId: null,
      });
      expect(adminRes.body.data.user.tokenVersion).toBeUndefined();
    });
  });

  describe('Role matrix & strict merchant/platform-admin separation', () => {
    it.each(['ADMIN', 'SYSTEM_ADMIN', 'OPS_AGENT'] as const)(
      'grants %s admin & read scopes while blocking merchant-only mutations even when user.merchantId is set',
      async (role) => {
        const { app, stores, authService } = buildFullTestApp();
        const fixture = await seedMerchantResources(stores, role.toLowerCase());
        const lender = await stores.lenders.findByCode('LENDER_ALPHA');
        expect(lender).not.toBeNull();

        const { accessToken } = await createAndLoginUser(stores, authService, {
          email: `${role.toLowerCase()}-with-mid@example.com`,
          role,
          // Deliberately attach a valid existing merchantId to verify role check still rejects merchant routes
          merchantId: fixture.merchantId,
        });
        const headers = { Authorization: `Bearer ${accessToken}` };

        // Authorized platform admin operations
        const auditRes = await request(app).get('/api/v1/admin/audit-logs').set(headers);
        expect(auditRes.status).toBe(200);

        const verifyRes = await request(app)
          .patch(`/api/v1/admin/merchants/${fixture.merchantId}/status`)
          .set(headers)
          .send({ status: 'VERIFIED' });
        expect(verifyRes.status).toBe(200);

        const lenderCfgRes = await request(app)
          .put(`/api/v1/admin/lenders/${lender!.id}/config`)
          .set(headers)
          .send({ priority: 25 });
        expect(lenderCfgRes.status).toBe(200);

        const appReadRes = await request(app)
          .get(`/api/v1/applications/${fixture.offerAppId}`)
          .set(headers);
        expect(appReadRes.status).toBe(200);

        const historyReadRes = await request(app)
          .get(`/api/v1/applications/${fixture.offerAppId}/history`)
          .set(headers);
        expect(historyReadRes.status).toBe(200);

        const offersReadRes = await request(app)
          .get(`/api/v1/applications/${fixture.offerAppId}/offers`)
          .set(headers);
        expect(offersReadRes.status).toBe(200);

        const cancelRes = await request(app)
          .post(`/api/v1/applications/${fixture.cancelableAppId}/cancel`)
          .set(headers)
          .send({ reason: 'Admin compliance cancellation' });
        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.data.application.status).toBe('CANCELLED');

        const adminLedgerRes = await request(app)
          .get(`/api/v1/ledger/commission?merchantId=${fixture.merchantId}`)
          .set(headers);
        expect(adminLedgerRes.status).toBe(200);

        // Unauthorized merchant-only endpoints must reject with 403 despite user.merchantId being present
        const deniedResponses = await Promise.all([
          request(app).get('/api/v1/merchants/me').set(headers),
          request(app).get('/api/v1/merchants/shops').set(headers),
          request(app)
            .post('/api/v1/merchants/shops')
            .set(headers)
            .send({ name: 'Blocked', city: 'Pune', state: 'MH' }),
          request(app)
            .post('/api/v1/customers')
            .set(headers)
            .send({ fullName: 'Blocked Cust', phone: '+919900001111' }),
          request(app)
            .post('/api/v1/purchases')
            .set(headers)
            .set('Idempotency-Key', `adm-p-${role}`)
            .send({
              shopId: fixture.shopId,
              customerId: fixture.customerId,
              productCategory: 'SMARTPHONE',
              amountPaise: '1000000',
            }),
          request(app).get('/api/v1/purchases').set(headers),
          request(app)
            .get(`/api/v1/purchases/${fixture.purchaseId}`)
            .set(headers),
          request(app)
            .post('/api/v1/checkout/sessions')
            .set(headers)
            .send({ shopId: fixture.shopId, purchaseId: fixture.purchaseId }),
          request(app)
            .post('/api/v1/applications')
            .set(headers)
            .set('Idempotency-Key', `adm-app-${role}`)
            .send({
              shopId: fixture.shopId,
              purchaseId: fixture.purchaseId,
              customerId: fixture.customerId,
              requestedAmountPaise: '1000000',
            }),
          request(app).get('/api/v1/applications').set(headers),
          request(app)
            .post(`/api/v1/applications/${fixture.draftAppId}/submit`)
            .set(headers),
          request(app)
            .post(`/api/v1/applications/${fixture.offerAppId}/offers/${fixture.offerId}/accept`)
            .set(headers),
        ]);

        for (const res of deniedResponses) {
          expect(res.status).toBe(403);
        }

        // Platform admin ledger without explicit merchantId must not fall back to req.user.merchantId
        const missingMerchantQueryRes = await request(app)
          .get('/api/v1/ledger/commission')
          .set(headers);
        expect(missingMerchantQueryRes.status).toBe(403);
      },
    );

    it.each(['MERCHANT_OWNER', 'MERCHANT_STAFF'] as const)(
      'allows %s intended merchant operations and rejects platform admin endpoints',
      async (role) => {
        const { app, stores, authService } = buildFullTestApp();
        const fixture = await seedMerchantResources(stores, role.toLowerCase());
        const { accessToken } = await createAndLoginUser(stores, authService, {
          email: `${role.toLowerCase()}@example.com`,
          role,
          merchantId: fixture.merchantId,
        });
        const headers = { Authorization: `Bearer ${accessToken}` };

        expect((await request(app).get('/api/v1/merchants/me').set(headers)).status).toBe(200);
        expect((await request(app).get('/api/v1/merchants/shops').set(headers)).status).toBe(200);
        expect((await request(app).get('/api/v1/purchases').set(headers)).status).toBe(200);
        expect(
          (await request(app).get(`/api/v1/purchases/${fixture.purchaseId}`).set(headers)).status,
        ).toBe(200);
        expect(
          (
            await request(app)
              .post('/api/v1/checkout/sessions')
              .set(headers)
              .send({ shopId: fixture.shopId, purchaseId: fixture.purchaseId })
          ).status,
        ).toBe(201);
        expect((await request(app).get('/api/v1/applications').set(headers)).status).toBe(200);
        expect(
          (await request(app).get(`/api/v1/applications/${fixture.offerAppId}`).set(headers))
            .status,
        ).toBe(200);
        expect(
          (
            await request(app)
              .get(`/api/v1/applications/${fixture.offerAppId}/history`)
              .set(headers)
          ).status,
        ).toBe(200);
        expect(
          (
            await request(app)
              .get(`/api/v1/applications/${fixture.offerAppId}/offers`)
              .set(headers)
          ).status,
        ).toBe(200);
        expect((await request(app).get('/api/v1/ledger/commission').set(headers)).status).toBe(200);

        const submitRes = await request(app)
          .post(`/api/v1/applications/${fixture.draftAppId}/submit`)
          .set(headers);
        expect(submitRes.status).toBe(200);
        expect(submitRes.body.data.application.status).toBe('OFFER_AVAILABLE');

        const acceptRes = await request(app)
          .post(`/api/v1/applications/${fixture.offerAppId}/offers/${fixture.offerId}/accept`)
          .set(headers);
        expect(acceptRes.status).toBe(200);
        expect(acceptRes.body.data.applicationStatus).toBe('CUSTOMER_ACCEPTED_OFFER');

        const cancelRes = await request(app)
          .post(`/api/v1/applications/${fixture.cancelableAppId}/cancel`)
          .set(headers)
          .send({ reason: 'Merchant staff cancellation' });
        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.data.application.status).toBe('CANCELLED');

        // Unauthorized platform admin endpoints
        expect((await request(app).get('/api/v1/admin/audit-logs').set(headers)).status).toBe(403);
        expect(
          (
            await request(app)
              .patch(`/api/v1/admin/merchants/${fixture.merchantId}/status`)
              .set(headers)
              .send({ status: 'SUSPENDED' })
          ).status,
        ).toBe(403);
      },
    );

    it('rejects non-standard non-merchant role carrying a merchantId with 403 everywhere', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, 'unknown-role');
      const { accessToken } = await createAndLoginUser(stores, authService, {
        email: 'stray-role@example.com',
        role: 'CUSTOMER_PORTAL' as unknown as UserRole,
        merchantId: fixture.merchantId,
      });
      const headers = { Authorization: `Bearer ${accessToken}` };

      expect((await request(app).get('/api/v1/merchants/me').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/applications').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/ledger/commission').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/audit-logs').set(headers)).status).toBe(403);
    });

    it('keeps application state-machine permissions unchanged (ADMIN_USER blocked on submit and acceptOffer)', async () => {
      const { stores, applicationService, offerService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, 'sm');

      let submitErr: unknown;
      try {
        await applicationService.submitApplication({
          applicationId: fixture.draftAppId,
          actor: 'ADMIN_USER',
          actorId: '00000000-0000-4000-8000-000000000099',
        });
      } catch (err) {
        submitErr = err;
      }
      expect(submitErr).toBeInstanceOf(InvalidStateTransitionError);
      expect((submitErr as InvalidStateTransitionError).reason).toBe('ACTOR_NOT_PERMITTED');

      let acceptErr: unknown;
      try {
        await offerService.acceptOffer({
          applicationId: fixture.offerAppId,
          offerId: fixture.offerId,
          actorType: 'ADMIN_USER',
          actorId: '00000000-0000-4000-8000-000000000099',
        });
      } catch (err) {
        acceptErr = err;
      }
      expect(acceptErr).toBeInstanceOf(InvalidStateTransitionError);
      expect((acceptErr as InvalidStateTransitionError).reason).toBe('ACTOR_NOT_PERMITTED');
    });
  });

  describe('Missing, malformed, nonexistent & client-tampered merchant identities', () => {
    it('rejects merchant user with merchantId: null with 403 across merchant endpoints and ledger', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, 'null-mid');
      const { accessToken } = await createAndLoginUser(stores, authService, {
        email: 'null-mid@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: null,
      });
      const headers = { Authorization: `Bearer ${accessToken}` };

      const responses = await Promise.all([
        request(app).get('/api/v1/merchants/me').set(headers),
        request(app).get('/api/v1/merchants/shops').set(headers),
        request(app)
          .post('/api/v1/customers')
          .set(headers)
          .send({ fullName: 'Cust', phone: '+919900002222' }),
        request(app)
          .post('/api/v1/purchases')
          .set(headers)
          .set('Idempotency-Key', 'null-mid-purch')
          .send({
            shopId: fixture.shopId,
            productCategory: 'SMARTPHONE',
            amountPaise: '1000000',
          }),
        request(app)
          .post('/api/v1/checkout/sessions')
          .set(headers)
          .send({ shopId: fixture.shopId, purchaseId: fixture.purchaseId }),
        request(app).get('/api/v1/applications').set(headers),
        request(app).get('/api/v1/ledger/commission').set(headers),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(403);
      }
    });

    it('rejects merchant user with malformed non-UUID merchantId with 403', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const { accessToken } = await createAndLoginUser(stores, authService, {
        email: 'bad-mid@example.com',
        role: 'MERCHANT_STAFF',
        merchantId: 'not-a-valid-uuid',
      });
      const headers = { Authorization: `Bearer ${accessToken}` };

      expect((await request(app).get('/api/v1/merchants/me').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/merchants/shops').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/applications').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/ledger/commission').set(headers)).status).toBe(403);
    });

    it('returns 404 on /merchants/me and 403 on operational routes when merchant entity does not exist', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const fixture = await seedMerchantResources(stores, 'ghost');
      const { accessToken } = await createAndLoginUser(stores, authService, {
        email: 'ghost-mid@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: '00000000-0000-4000-8000-999999999999',
      });
      const headers = { Authorization: `Bearer ${accessToken}` };

      const meRes = await request(app).get('/api/v1/merchants/me').set(headers);
      expect(meRes.status).toBe(404);

      expect((await request(app).get('/api/v1/merchants/shops').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/applications').set(headers)).status).toBe(403);
      expect(
        (
          await request(app)
            .post('/api/v1/checkout/sessions')
            .set(headers)
            .send({ shopId: fixture.shopId, purchaseId: fixture.purchaseId })
        ).status,
      ).toBe(403);
      expect((await request(app).get('/api/v1/ledger/commission').set(headers)).status).toBe(403);
    });

    it('rejects client-supplied conflicting merchantId in query or body with 403', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const merchantA = await seedMerchantResources(stores, 'tamper-a');
      const merchantB = await seedMerchantResources(stores, 'tamper-b');

      const ownerA = await createAndLoginUser(stores, authService, {
        email: 'owner-tamper-a@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: merchantA.merchantId,
      });
      const headers = { Authorization: `Bearer ${ownerA.accessToken}` };

      const tamperedResponses = await Promise.all([
        request(app)
          .get(`/api/v1/merchants/shops?merchantId=${merchantB.merchantId}`)
          .set(headers),
        request(app)
          .post('/api/v1/customers')
          .set(headers)
          .send({
            merchantId: merchantB.merchantId,
            fullName: 'Tamper',
            phone: '+919900003333',
          }),
        request(app)
          .post('/api/v1/purchases')
          .set(headers)
          .set('Idempotency-Key', 'tamper-purch-key')
          .send({
            merchantId: merchantB.merchantId,
            shopId: merchantA.shopId,
            productCategory: 'SMARTPHONE',
            amountPaise: '1000000',
          }),
        request(app)
          .post(`/api/v1/checkout/sessions?merchantId=${merchantB.merchantId}`)
          .set(headers)
          .send({ shopId: merchantA.shopId, purchaseId: merchantA.purchaseId }),
        request(app)
          .get(`/api/v1/ledger/commission?merchantId=${merchantB.merchantId}`)
          .set(headers),
        request(app)
          .post(`/api/v1/applications/${merchantA.offerAppId}/offers/${merchantA.offerId}/accept`)
          .set(headers)
          .send({ merchantId: merchantB.merchantId }),
      ]);

      for (const res of tamperedResponses) {
        expect(res.status).toBe(403);
      }
    });
  });

  describe('Cross-merchant application, offer & commission ledger scoping', () => {
    it('blocks Merchant B from reading, submitting, canceling, listing/accepting offers on Merchant A applications', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const merchantA = await seedMerchantResources(stores, 'cross-a');
      const merchantB = await seedMerchantResources(stores, 'cross-b');

      const ownerB = await createAndLoginUser(stores, authService, {
        email: 'owner-cross-b@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: merchantB.merchantId,
      });
      const headersB = { Authorization: `Bearer ${ownerB.accessToken}` };

      expect(
        (await request(app).get(`/api/v1/applications/${merchantA.offerAppId}`).set(headersB))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/v1/applications/${merchantA.offerAppId}/history`)
            .set(headersB)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .get(`/api/v1/applications/${merchantA.offerAppId}/offers`)
            .set(headersB)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/applications/${merchantA.draftAppId}/submit`)
            .set(headersB)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`/api/v1/applications/${merchantA.cancelableAppId}/cancel`)
            .set(headersB)
            .send({ reason: 'Cross-merchant cancel attempt' })
        ).status,
      ).toBe(403);

      const crossAcceptRes = await request(app)
        .post(`/api/v1/applications/${merchantA.offerAppId}/offers/${merchantA.offerId}/accept`)
        .set(headersB);
      expect(crossAcceptRes.status).toBe(403);

      // Confirm Merchant A's offer and application remain untouched
      const unchangedApp = await stores.applications.findById(merchantA.offerAppId);
      const unchangedOffer = await stores.offers.findById(merchantA.offerId);
      expect(unchangedApp?.status).toBe('OFFER_AVAILABLE');
      expect(unchangedOffer?.status).toBe('ACTIVE');
    });

    it('enforces explicit valid merchantId query param for platform admin commission ledger', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const merchantA = await seedMerchantResources(stores, 'ledger-a');
      const admin = await createAndLoginUser(stores, authService, {
        email: 'admin-ledger@example.com',
        role: 'ADMIN',
        // Populate merchantId on admin record to prove no fallback occurs
        merchantId: merchantA.merchantId,
      });
      const headers = { Authorization: `Bearer ${admin.accessToken}` };

      expect((await request(app).get('/api/v1/ledger/commission').set(headers)).status).toBe(403);
      expect((await request(app).get('/api/v1/ledger/commission?merchantId=').set(headers)).status).toBe(403);
      expect(
        (await request(app).get('/api/v1/ledger/commission?merchantId=not-a-uuid').set(headers))
          .status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .get('/api/v1/ledger/commission?merchantId=00000000-0000-4000-8000-999999999999')
            .set(headers)
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .get(`/api/v1/ledger/commission?merchantId=${merchantA.merchantId}`)
            .set(headers)
        ).status,
      ).toBe(200);
    });
  });

  describe('PrismaStore-backed Batch 1A enforcement', () => {
    function buildPrismaMockApp() {
      const users = new Map<string, UserEntity>();
      const merchants = new Map<string, MerchantEntity>();
      const customers = new Map<string, CustomerEntity>();
      const purchases = new Map<string, PurchaseEntity>();
      const applications = new Map<string, FinancingApplicationEntity>();
      const appHistory: ApplicationStatusHistoryEntity[] = [];
      const offers = new Map<string, FinancingOfferEntity>();
      const commissions: CommissionEntryEntity[] = [];

      let userFindUniqueCalls = 0;
      let merchantFindUniqueCalls = 0;

      interface MockPrismaClient {
        user: {
          findUnique: (args: { where: { id?: string; email?: string } }) => Promise<UserEntity | null>;
        };
        merchant: {
          findUnique: (args: { where: { id: string } }) => Promise<MerchantEntity | null>;
          findMany: () => Promise<MerchantEntity[]>;
        };
        customer: {
          findUnique: (args: { where: { id: string } }) => Promise<CustomerEntity | null>;
        };
        purchase: {
          findUnique: (args: { where: { id: string } }) => Promise<PurchaseEntity | null>;
        };
        financingApplication: {
          findUnique: (args: { where: { id: string } }) => Promise<FinancingApplicationEntity | null>;
          update: (args: {
            where: { id: string };
            data: { status: FinancingApplicationEntity['status']; version: { increment: number } };
          }) => Promise<FinancingApplicationEntity>;
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
        financingOffer: {
          findUnique: (args: { where: { id: string } }) => Promise<FinancingOfferEntity | null>;
          findMany: (args: {
            where: { applicationId: string; status?: string };
          }) => Promise<FinancingOfferEntity[]>;
          update: (args: {
            where: { id: string };
            data: { status: FinancingOfferEntity['status'] };
          }) => Promise<FinancingOfferEntity>;
          updateMany: (args: {
            where: { applicationId: string; id: { not: string }; status: string };
            data: { status: FinancingOfferEntity['status'] };
          }) => Promise<{ count: number }>;
        };
        commissionEntry: {
          findMany: (args: { where: { merchantId: string } }) => Promise<CommissionEntryEntity[]>;
          count: (args: { where: { merchantId: string } }) => Promise<number>;
        };
        $transaction: <T>(fn: (tx: MockPrismaClient) => Promise<T>) => Promise<T>;
      }

      const mockPrisma: MockPrismaClient = {
        user: {
          findUnique: async ({ where }) => {
            userFindUniqueCalls += 1;
            if (where.id) return users.get(where.id) ?? null;
            if (where.email) {
              for (const user of users.values()) {
                if (user.email === where.email) return user;
              }
            }
            return null;
          },
        },
        merchant: {
          findUnique: async ({ where }) => {
            merchantFindUniqueCalls += 1;
            return merchants.get(where.id) ?? null;
          },
          findMany: async () => Array.from(merchants.values()),
        },
        customer: {
          findUnique: async ({ where }) => customers.get(where.id) ?? null,
        },
        purchase: {
          findUnique: async ({ where }) => purchases.get(where.id) ?? null,
        },
        financingApplication: {
          findUnique: async ({ where }) => applications.get(where.id) ?? null,
          update: async ({ where, data }) => {
            const existing = applications.get(where.id)!;
            const updated: FinancingApplicationEntity = {
              ...existing,
              status: data.status,
              version: existing.version + data.version.increment,
              updatedAt: new Date(),
            };
            applications.set(where.id, updated);
            return updated;
          },
          updateMany: async ({ where, data }) => {
            const existing = applications.get(where.id);
            if (!existing || existing.version !== where.version) {
              return { count: 0 };
            }
            const updated: FinancingApplicationEntity = {
              ...existing,
              status: data.status,
              version: existing.version + data.version.increment,
              updatedAt: new Date(),
            };
            applications.set(where.id, updated);
            return { count: 1 };
          },
        },
        applicationStatusHistory: {
          create: async ({ data }) => {
            const entry: ApplicationStatusHistoryEntity = {
              ...data,
              id: `00000000-0000-4000-8000-${String(appHistory.length + 1).padStart(12, '0')}`,
              createdAt: new Date(),
            };
            appHistory.push(entry);
            return entry;
          },
        },
        financingOffer: {
          findUnique: async ({ where }) => offers.get(where.id) ?? null,
          findMany: async ({ where }) =>
            Array.from(offers.values()).filter(
              (o) =>
                o.applicationId === where.applicationId &&
                (!where.status || o.status === where.status),
            ),
          update: async ({ where, data }) => {
            const existing = offers.get(where.id)!;
            const updated: FinancingOfferEntity = {
              ...existing,
              status: data.status,
              updatedAt: new Date(),
            };
            offers.set(where.id, updated);
            return updated;
          },
          updateMany: async ({ where, data }) => {
            for (const [id, offer] of offers.entries()) {
              if (
                offer.applicationId === where.applicationId &&
                id !== where.id.not &&
                offer.status === where.status
              ) {
                offers.set(id, { ...offer, status: data.status, updatedAt: new Date() });
              }
            }
            return { count: 1 };
          },
        },
        commissionEntry: {
          findMany: async ({ where }) =>
            commissions.filter((c) => c.merchantId === where.merchantId),
          count: async ({ where }) =>
            commissions.filter((c) => c.merchantId === where.merchantId).length,
        },
        $transaction: async <T>(fn: (tx: MockPrismaClient) => Promise<T>): Promise<T> => {
          return fn(mockPrisma);
        },
      };

      const stores = new PrismaStore(mockPrisma as unknown as PrismaClient);
      const config = parseEnv({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: 'postgresql://test_user:test_pass@localhost:5432/test_db',
        CORS_ALLOWED_ORIGINS: 'https://merchant.example.com',
        DEV_DEFAULT_WEBHOOK_SECRET: 'lender-default-dev-secret',
      });

      const authService = new AuthService(stores, config.JWT_SECRET);
      const applicationService = new ApplicationService(stores);
      const checkoutService = new CheckoutService(stores);
      const offerService = new OfferService(stores);
      const webhookService = new WebhookService(stores, config.WEBHOOK_DEFAULT_TOLERANCE_SECONDS);
      const commissionService = new CommissionService(stores);
      const adminService = new AdminService(stores);

      const app = createApp({
        config,
        logger: pino({ level: 'silent' }),
        readinessCheck: () => Promise.resolve(),
        routerDeps: {
          stores,
          authService,
          tokenService: authService.getTokenService(),
          checkoutService,
          applicationService,
          offerService,
          webhookService,
          commissionService,
          adminService,
        },
      });

      return {
        app,
        tokenService: authService.getTokenService(),
        records: { users, merchants, customers, purchases, applications, offers, commissions },
        counts: {
          getUserFindUniqueCalls: () => userFindUniqueCalls,
          getMerchantFindUniqueCalls: () => merchantFindUniqueCalls,
        },
      };
    }

    it('enforces auth, UUID guards, tenant scoping, and offer acceptance via PrismaStore', async () => {
      const ctx = buildPrismaMockApp();
      const now = new Date();
      const merchantAId = '11111111-1111-4111-8111-111111111111';
      const merchantBId = '22222222-2222-4222-8222-222222222222';
      const missingMerchantId = '99999999-9999-4999-8999-999999999999';
      const ownerAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const ownerBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const ghostMerchantUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const badMerchantUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const opsAgentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const appId = '33333333-3333-4333-8333-333333333333';
      const offerPrimaryId = '44444444-4444-4444-8444-444444444444';
      const offerSiblingId = '55555555-5555-4555-8555-555555555555';

      ctx.records.merchants.set(merchantAId, {
        id: merchantAId,
        legalName: 'Prisma Retail A',
        tradeName: 'Retail A',
        status: 'VERIFIED',
        verifiedAt: now,
        suspendedAt: null,
        suspensionReason: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.merchants.set(merchantBId, {
        id: merchantBId,
        legalName: 'Prisma Retail B',
        tradeName: 'Retail B',
        status: 'VERIFIED',
        verifiedAt: now,
        suspendedAt: null,
        suspensionReason: null,
        createdAt: now,
        updatedAt: now,
      });

      ctx.records.users.set(ownerAId, {
        id: ownerAId,
        email: 'prisma-a@example.com',
        passwordHash: 'hash',
        role: 'MERCHANT_OWNER',
        status: 'ACTIVE',
        merchantId: merchantAId,
        tokenVersion: 3,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.users.set(ownerBId, {
        id: ownerBId,
        email: 'prisma-b@example.com',
        passwordHash: 'hash',
        role: 'MERCHANT_OWNER',
        status: 'ACTIVE',
        merchantId: merchantBId,
        tokenVersion: 1,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.users.set(ghostMerchantUserId, {
        id: ghostMerchantUserId,
        email: 'prisma-ghost@example.com',
        passwordHash: 'hash',
        role: 'MERCHANT_OWNER',
        status: 'ACTIVE',
        merchantId: missingMerchantId,
        tokenVersion: 1,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.users.set(badMerchantUserId, {
        id: badMerchantUserId,
        email: 'prisma-badmid@example.com',
        passwordHash: 'hash',
        role: 'MERCHANT_STAFF',
        status: 'ACTIVE',
        merchantId: 'bad-uuid',
        tokenVersion: 1,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.users.set(opsAgentId, {
        id: opsAgentId,
        email: 'prisma-ops@example.com',
        passwordHash: 'hash',
        role: 'OPS_AGENT',
        status: 'ACTIVE',
        merchantId: merchantAId,
        tokenVersion: 1,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      });

      ctx.records.applications.set(appId, {
        id: appId,
        merchantId: merchantAId,
        shopId: '66666666-6666-4666-8666-666666666666',
        purchaseId: '77777777-7777-4777-8777-777777777777',
        customerId: '88888888-8888-4888-8888-888888888888',
        createdByUserId: ownerAId,
        status: 'OFFER_AVAILABLE',
        routingMode: 'SEQUENTIAL',
        requestedAmountPaise: 5000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'prisma-app-key',
        version: 1,
        submittedAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
        terminalAt: null,
        createdAt: now,
        updatedAt: now,
      });

      ctx.records.offers.set(offerPrimaryId, {
        id: offerPrimaryId,
        applicationId: appId,
        lenderApplicationId: '12121212-1212-4121-8121-121212121212',
        merchantId: merchantAId,
        lenderId: '13131313-1313-4131-8131-131313131313',
        offerType: 'FIRM_OFFER',
        status: 'ACTIVE',
        lenderOfferReference: 'PRISMA-OFFER-1',
        principalPaise: 5000000n,
        downPaymentPaise: 0n,
        tenureMonths: 6,
        interestRatePercent: '12.0',
        rateType: 'REDUCING_BALANCE',
        aprPercent: '12.5',
        emiPaise: 862742n,
        processingFeePaise: 0n,
        taxesPaise: 0n,
        otherChargesPaise: 0n,
        totalRepayablePaise: 5176452n,
        repaymentSchedule: null,
        termsVersion: 'v1',
        termsUrl: null,
        expiresAt: new Date(now.getTime() + 86400000),
        isSimulated: true,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.offers.set(offerSiblingId, {
        ...ctx.records.offers.get(offerPrimaryId)!,
        id: offerSiblingId,
        lenderOfferReference: 'PRISMA-OFFER-2',
      });

      ctx.records.commissions.push({
        id: '14141414-1414-4141-8141-141414141414',
        merchantId: merchantAId,
        applicationId: appId,
        transactionId: '15151515-1515-4151-8151-151515151515',
        entryType: 'ACCRUAL',
        amountPaise: 75000n,
        ruleCode: 'DEFAULT_1_5_PCT',
        ruleSnapshot: {},
        reversesEntryId: null,
        note: null,
        createdAt: now,
      });

      const ownerAToken = ctx.tokenService.signAccessToken({
        userId: ownerAId,
        role: 'MERCHANT_OWNER',
        merchantId: merchantAId,
        tokenVersion: 3,
      });
      const ownerBToken = ctx.tokenService.signAccessToken({
        userId: ownerBId,
        role: 'MERCHANT_OWNER',
        merchantId: merchantBId,
        tokenVersion: 1,
      });
      const ghostToken = ctx.tokenService.signAccessToken({
        userId: ghostMerchantUserId,
        role: 'MERCHANT_OWNER',
        merchantId: missingMerchantId,
        tokenVersion: 1,
      });
      const badMidToken = ctx.tokenService.signAccessToken({
        userId: badMerchantUserId,
        role: 'MERCHANT_STAFF',
        merchantId: 'bad-uuid',
        tokenVersion: 1,
      });
      const opsToken = ctx.tokenService.signAccessToken({
        userId: opsAgentId,
        role: 'OPS_AGENT',
        merchantId: merchantAId,
        tokenVersion: 1,
      });
      const malformedSubToken = ctx.tokenService.signAccessToken({
        userId: 'not-a-uuid',
        role: 'MERCHANT_OWNER',
        merchantId: merchantAId,
        tokenVersion: 1,
      });

      // 1. /auth/me projects only safe user fields and short-circuits invalid UUID sub before Prisma lookup
      const malformedSubRes = await request(ctx.app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${malformedSubToken}`);
      expect(malformedSubRes.status).toBe(401);
      expect(ctx.counts.getUserFindUniqueCalls()).toBe(0);

      const meRes = await request(ctx.app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ownerAToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user).toEqual({
        id: ownerAId,
        email: 'prisma-a@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: merchantAId,
      });
      expect(meRes.body.data.user.tokenVersion).toBeUndefined();

      // 2. Malformed merchantId rejects before calling prisma.merchant.findUnique
      const badMidRes = await request(ctx.app)
        .get('/api/v1/merchants/me')
        .set('Authorization', `Bearer ${badMidToken}`);
      expect(badMidRes.status).toBe(403);
      expect(ctx.counts.getMerchantFindUniqueCalls()).toBe(0);

      // 3. Nonexistent merchant returns 404 on /merchants/me and 403 on operational routes
      expect(
        (
          await request(ctx.app)
            .get('/api/v1/merchants/me')
            .set('Authorization', `Bearer ${ghostToken}`)
        ).status,
      ).toBe(404);
      expect(
        (
          await request(ctx.app)
            .get('/api/v1/ledger/commission')
            .set('Authorization', `Bearer ${ghostToken}`)
        ).status,
      ).toBe(403);

      // 4. OPS_AGENT with merchantId in DB still blocked on merchant routes & ledger fallback
      expect(
        (
          await request(ctx.app)
            .get('/api/v1/merchants/me')
            .set('Authorization', `Bearer ${opsToken}`)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(ctx.app)
            .get('/api/v1/ledger/commission')
            .set('Authorization', `Bearer ${opsToken}`)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(ctx.app)
            .get(`/api/v1/ledger/commission?merchantId=${missingMerchantId}`)
            .set('Authorization', `Bearer ${opsToken}`)
        ).status,
      ).toBe(404);
      const opsLedgerRes = await request(ctx.app)
        .get(`/api/v1/ledger/commission?merchantId=${merchantAId}`)
        .set('Authorization', `Bearer ${opsToken}`);
      expect(opsLedgerRes.status).toBe(200);
      expect(opsLedgerRes.body.data.summary.netCommissionPaise).toBe('75000');

      // 5. Cross-merchant offer acceptance blocked (403); owning merchant succeeds (200) via PrismaStore
      const crossAccept = await request(ctx.app)
        .post(`/api/v1/applications/${appId}/offers/${offerPrimaryId}/accept`)
        .set('Authorization', `Bearer ${ownerBToken}`);
      expect(crossAccept.status).toBe(403);

      const ownAccept = await request(ctx.app)
        .post(`/api/v1/applications/${appId}/offers/${offerPrimaryId}/accept`)
        .set('Authorization', `Bearer ${ownerAToken}`);
      expect(ownAccept.status).toBe(200);
      expect(ownAccept.body.data.applicationStatus).toBe('CUSTOMER_ACCEPTED_OFFER');
      expect(ctx.records.applications.get(appId)?.status).toBe('CUSTOMER_ACCEPTED_OFFER');
      expect(ctx.records.offers.get(offerPrimaryId)?.status).toBe('ACCEPTED');
      expect(ctx.records.offers.get(offerSiblingId)?.status).toBe('SUPERSEDED');
    });
  });
});
