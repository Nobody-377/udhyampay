import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors';
import { parseEnv } from '../../src/config/env';
import { AdminService } from '../../src/modules/admin/admin.service';
import { ApplicationService } from '../../src/modules/applications/application.service';
import { requireMerchantStatus } from '../../src/modules/auth/auth.middleware';
import { AuthService } from '../../src/modules/auth/auth.service';
import { passwordHasher } from '../../src/modules/auth/password';
import { CheckoutService } from '../../src/modules/checkout/checkout.service';
import { CommissionService } from '../../src/modules/ledger/commission.service';
import { OfferService } from '../../src/modules/offers/offer.service';
import type { InMemoryStores } from '../../src/modules/persistence/in-memory-store';
import { PrismaStore } from '../../src/modules/persistence/prisma-store';
import type {
  ApplicationStatusHistoryEntity,
  CustomerConsentEntity,
  CustomerEntity,
  FinancingApplicationEntity,
  MerchantEntity,
  MerchantStatus,
  PurchaseEntity,
  ShopEntity,
  UserEntity,
  UserRole,
} from '../../src/modules/persistence/stores';
import { WebhookService } from '../../src/modules/webhooks/webhook.service';
import { buildFullTestApp } from '../helpers/build-full-app';

async function createUserWithToken(
  stores: InMemoryStores,
  authService: AuthService,
  params: {
    email: string;
    role: UserRole;
    merchantId: string | null;
    status?: 'ACTIVE' | 'SUSPENDED';
  },
): Promise<{ user: UserEntity; accessToken: string }> {
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
    return { user, accessToken: loggedIn.tokens.accessToken };
  }

  const accessToken = authService.getTokenService().signAccessToken({
    userId: user.id,
    role: user.role,
    merchantId: user.merchantId,
    tokenVersion: user.tokenVersion,
  });
  return { user, accessToken };
}

async function seedMerchantScenario(
  stores: InMemoryStores,
  suffix: string,
  status: MerchantStatus = 'VERIFIED',
) {
  const now = new Date();
  const merchant = await stores.merchants.create({
    legalName: `Legal ${suffix}`,
    tradeName: `Trade ${suffix}`,
    status,
    verifiedAt: status === 'VERIFIED' ? now : null,
    suspendedAt: status === 'SUSPENDED' ? now : null,
    suspensionReason: status === 'SUSPENDED' ? 'Compliance hold' : null,
  });

  const shop = await stores.shops.create({
    merchantId: merchant.id,
    name: `Shop ${suffix}`,
    city: 'Bengaluru',
    state: 'Karnataka',
    status: 'ACTIVE',
  });

  const phoneDigits = suffix.replace(/\D/g, '').padStart(4, '0').slice(-4);
  const customer = await stores.customers.create({
    merchantId: merchant.id,
    fullName: `Customer ${suffix}`,
    phone: `+91981111${phoneDigits}`,
    retentionExpiresAt: new Date(now.getTime() + 86400000 * 365),
    anonymizedAt: null,
  });

  const consent = await stores.consents.create({
    merchantId: merchant.id,
    customerId: customer.id,
    purpose: 'FINANCING_APPLICATION_PROCESSING',
    noticeVersion: 'v1.0',
    captureMethod: 'CUSTOMER_CHECKOUT_SESSION',
    grantedAt: now,
    revokedAt: null,
  });

  const checkoutPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Checkout Phone ${suffix}`,
    amountPaise: 2500000n,
    currency: 'INR',
    idempotencyKey: `purch-checkout-${suffix}`,
  });

  const appPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `App Phone ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purch-app-${suffix}`,
  });

  const submitPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Submit Phone ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purch-submit-${suffix}`,
  });

  const cancelPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Cancel Phone ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purch-cancel-${suffix}`,
  });

  const offerPurchase = await stores.purchases.createIdempotent({
    merchantId: merchant.id,
    shopId: shop.id,
    customerId: customer.id,
    productCategory: 'SMARTPHONE',
    productDescription: `Offer Phone ${suffix}`,
    amountPaise: 3000000n,
    currency: 'INR',
    idempotencyKey: `purch-offer-${suffix}`,
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

  const submitApp = await stores.applications.create({
    merchantId: merchant.id,
    shopId: shop.id,
    purchaseId: submitPurchase.id,
    customerId: customer.id,
    createdByUserId: null,
    status: 'CUSTOMER_CONSENT_PENDING',
    routingMode: 'SEQUENTIAL',
    requestedAmountPaise: 3000000n,
    downPaymentPaise: 0n,
    requestedTenureMonths: 6,
    idempotencyKey: `app-submit-${suffix}`,
    submittedAt: null,
    expiresAt: new Date(now.getTime() + 86400000),
    terminalAt: null,
  });

  const cancelApp = await stores.applications.create({
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
    expiresAt: new Date(now.getTime() + 86400000),
    terminalAt: null,
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
    submittedAt: now,
    expiresAt: new Date(now.getTime() + 86400000),
    terminalAt: null,
  });

  const lenderAttempt = await stores.lenderApplications.create({
    applicationId: offerApp.id,
    merchantId: merchant.id,
    lenderId: lender.id,
    attemptNo: 1,
    requestKey: `lender-req-${suffix}`,
    externalReference: `EXT-${suffix}`,
    outcome: 'OFFERED',
    errorCode: null,
    responseHash: null,
    safeResponseSummary: null,
    reconcileAttempts: 0,
    startedAt: now,
    completedAt: now,
    latencyMs: 10,
  });

  const offer = await stores.offers.create({
    applicationId: offerApp.id,
    lenderApplicationId: lenderAttempt.id,
    merchantId: merchant.id,
    lenderId: lender.id,
    offerType: 'FIRM_OFFER',
    status: 'ACTIVE',
    lenderOfferReference: `OFFER-${suffix}`,
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
    expiresAt: new Date(now.getTime() + 86400000),
    isSimulated: true,
  });

  return {
    merchant,
    shopId: shop.id,
    customerId: customer.id,
    consentId: consent.id,
    checkoutPurchaseId: checkoutPurchase.id,
    appPurchaseId: appPurchase.id,
    submitAppId: submitApp.id,
    cancelAppId: cancelApp.id,
    offerAppId: offerApp.id,
    offerId: offer.id,
  };
}

describe('Batch 1B — Tenant Ownership & Merchant Lifecycle Enforcement', () => {
  describe('Customer Consent Ownership & IDOR (DELETE /customers/:id/consents/:consentId)', () => {
    it('enforces customer, consent, and merchant ownership plus UUID validation', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const merchantA = await seedMerchantScenario(stores, '1001', 'VERIFIED');
      const merchantB = await seedMerchantScenario(stores, '1002', 'VERIFIED');

      const ownerA = await createUserWithToken(stores, authService, {
        email: 'consent-a@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: merchantA.merchant.id,
      });
      const headersA = { Authorization: `Bearer ${ownerA.accessToken}` };

      // Second customer under Merchant A
      const customerA2 = await stores.customers.create({
        merchantId: merchantA.merchant.id,
        fullName: 'Second Customer A',
        phone: '+919822220001',
        retentionExpiresAt: new Date(Date.now() + 86400000),
        anonymizedAt: null,
      });
      const consentA2 = await stores.consents.create({
        merchantId: merchantA.merchant.id,
        customerId: customerA2.id,
        purpose: 'LENDER_DATA_SHARING',
        noticeVersion: 'v1.0',
        captureMethod: 'MERCHANT_ASSISTED',
        grantedAt: new Date(),
        revokedAt: null,
      });

      let customerFindCalls = 0;
      let consentFindCalls = 0;
      let consentRevokeCalls = 0;
      const origCustomerFindById = stores.customers.findById.bind(stores.customers);
      const origConsentFindById = stores.consents.findById.bind(stores.consents);
      const origConsentRevoke = stores.consents.revoke.bind(stores.consents);

      stores.customers.findById = async (id) => {
        customerFindCalls += 1;
        return origCustomerFindById(id);
      };
      stores.consents.findById = async (id) => {
        consentFindCalls += 1;
        return origConsentFindById(id);
      };
      stores.consents.revoke = async (id) => {
        consentRevokeCalls += 1;
        return origConsentRevoke(id);
      };

      // 1. Invalid UUIDs reject with 400 before customer/consent lookups or revocation
      const badCustomerUuidRes = await request(app)
        .delete(`/api/v1/customers/not-a-uuid/consents/${merchantA.consentId}`)
        .set(headersA);
      expect(badCustomerUuidRes.status).toBe(400);

      const badConsentUuidRes = await request(app)
        .delete(`/api/v1/customers/${merchantA.customerId}/consents/not-a-uuid`)
        .set(headersA);
      expect(badConsentUuidRes.status).toBe(400);

      expect(customerFindCalls).toBe(0);
      expect(consentFindCalls).toBe(0);
      expect(consentRevokeCalls).toBe(0);

      // 2. Same-merchant cross-customer consent IDOR -> 404 Consent not found; consentA2 untouched
      const wrongCustomerRes = await request(app)
        .delete(`/api/v1/customers/${merchantA.customerId}/consents/${consentA2.id}`)
        .set(headersA);
      expect(wrongCustomerRes.status).toBe(404);
      expect(wrongCustomerRes.body.error.message).toBe('Consent not found');
      expect((await origConsentFindById(consentA2.id))?.revokedAt).toBeNull();

      // 3. Cross-merchant consent IDOR under Merchant A's customer -> 404 Consent not found
      const foreignConsentRes = await request(app)
        .delete(`/api/v1/customers/${merchantA.customerId}/consents/${merchantB.consentId}`)
        .set(headersA);
      expect(foreignConsentRes.status).toBe(404);
      expect(foreignConsentRes.body.error.message).toBe('Consent not found');
      expect((await origConsentFindById(merchantB.consentId))?.revokedAt).toBeNull();

      // 4. Cross-merchant customer IDOR -> 404 Customer not found; consentB untouched
      const foreignCustomerRes = await request(app)
        .delete(`/api/v1/customers/${merchantB.customerId}/consents/${merchantB.consentId}`)
        .set(headersA);
      expect(foreignCustomerRes.status).toBe(404);
      expect(foreignCustomerRes.body.error.message).toBe('Customer not found');
      expect((await origConsentFindById(merchantB.consentId))?.revokedAt).toBeNull();

      // 5. Nonexistent consentId -> 404 Consent not found
      const missingConsentRes = await request(app)
        .delete(
          `/api/v1/customers/${merchantA.customerId}/consents/00000000-0000-4000-8000-000000000999`,
        )
        .set(headersA);
      expect(missingConsentRes.status).toBe(404);
      expect(missingConsentRes.body.error.message).toBe('Consent not found');
      expect(consentRevokeCalls).toBe(0);

      // 6. Own customer + own consent -> 200 and consent revoked
      const ownRevokeRes = await request(app)
        .delete(`/api/v1/customers/${merchantA.customerId}/consents/${merchantA.consentId}`)
        .set(headersA);
      expect(ownRevokeRes.status).toBe(200);
      expect(consentRevokeCalls).toBe(1);
      expect((await origConsentFindById(merchantA.consentId))?.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('Purchase Shop & Customer Ownership (POST /purchases)', () => {
    it('rejects foreign or nonexistent shopId/customerId with 403 before creating purchase or idempotency record', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const merchantA = await seedMerchantScenario(stores, '2001', 'VERIFIED');
      const merchantB = await seedMerchantScenario(stores, '2002', 'VERIFIED');

      const ownerA = await createUserWithToken(stores, authService, {
        email: 'purch-a@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: merchantA.merchant.id,
      });
      const headersA = { Authorization: `Bearer ${ownerA.accessToken}` };

      // 1. Foreign shopId -> 403 and idempotency key must NOT be consumed
      const foreignShopKey = 'idem-foreign-shop-1';
      const foreignShopRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', foreignShopKey)
        .send({
          shopId: merchantB.shopId,
          customerId: merchantA.customerId,
          productCategory: 'SMARTPHONE',
          amountPaise: '4000000',
        });
      expect(foreignShopRes.status).toBe(403);
      expect(foreignShopRes.body.error.message).toBe('Shop does not belong to this merchant');

      const listAfterForeignShop = await stores.purchases.listByMerchant(merchantA.merchant.id);
      const countBefore = listAfterForeignShop.total;

      // Retrying with the exact same Idempotency-Key and Merchant A's own shop succeeds
      const retryOwnShopRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', foreignShopKey)
        .send({
          shopId: merchantA.shopId,
          productCategory: 'SMARTPHONE',
          amountPaise: '4000000',
        });
      expect(retryOwnShopRes.status).toBe(201);
      expect(retryOwnShopRes.body.data.purchase.shopId).toBe(merchantA.shopId);
      expect(retryOwnShopRes.body.data.purchase.customerId).toBeNull();
      expect((await stores.purchases.listByMerchant(merchantA.merchant.id)).total).toBe(
        countBefore + 1,
      );

      // 2. Nonexistent shopId -> 403, no purchase persisted
      const missingShopRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', 'idem-missing-shop-1')
        .send({
          shopId: '00000000-0000-4000-8000-000000000777',
          productCategory: 'LAPTOP',
          amountPaise: '5000000',
        });
      expect(missingShopRes.status).toBe(403);
      expect(missingShopRes.body.error.message).toBe('Shop does not belong to this merchant');
      expect((await stores.purchases.listByMerchant(merchantA.merchant.id)).total).toBe(
        countBefore + 1,
      );

      // 3. Own shopId + foreign customerId -> 403 and idempotency key NOT claimed
      const foreignCustomerKey = 'idem-foreign-customer-1';
      const foreignCustRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', foreignCustomerKey)
        .send({
          shopId: merchantA.shopId,
          customerId: merchantB.customerId,
          productCategory: 'SMARTPHONE',
          amountPaise: '4500000',
        });
      expect(foreignCustRes.status).toBe(403);
      expect(foreignCustRes.body.error.message).toBe('Customer does not belong to this merchant');
      expect((await stores.purchases.listByMerchant(merchantA.merchant.id)).total).toBe(
        countBefore + 1,
      );

      // 4. Own shopId + nonexistent customerId -> 403
      const missingCustRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', 'idem-missing-customer-1')
        .send({
          shopId: merchantA.shopId,
          customerId: '00000000-0000-4000-8000-000000000888',
          productCategory: 'SMARTPHONE',
          amountPaise: '4500000',
        });
      expect(missingCustRes.status).toBe(403);
      expect(missingCustRes.body.error.message).toBe('Customer does not belong to this merchant');
      expect((await stores.purchases.listByMerchant(merchantA.merchant.id)).total).toBe(
        countBefore + 1,
      );

      // 5. Own shopId + own customerId with previously rejected foreignCustomerKey -> 201
      const validFullRes = await request(app)
        .post('/api/v1/purchases')
        .set(headersA)
        .set('Idempotency-Key', foreignCustomerKey)
        .send({
          shopId: merchantA.shopId,
          customerId: merchantA.customerId,
          productCategory: 'SMARTPHONE',
          amountPaise: '4500000',
        });
      expect(validFullRes.status).toBe(201);
      expect(validFullRes.body.data.purchase.customerId).toBe(merchantA.customerId);
      expect((await stores.purchases.listByMerchant(merchantA.merchant.id)).total).toBe(
        countBefore + 2,
      );
    });
  });

  describe('Merchant Status Enforcement Matrix (requireMerchantStatus)', () => {
    it('allows all 10 routes for VERIFIED merchants', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const verified = await seedMerchantScenario(stores, '3001', 'VERIFIED');
      const staff = await createUserWithToken(stores, authService, {
        email: 'verified-staff@example.com',
        role: 'MERCHANT_STAFF',
        merchantId: verified.merchant.id,
      });
      const headers = { Authorization: `Bearer ${staff.accessToken}` };

      expect(
        (
          await request(app)
            .post('/api/v1/merchants/shops')
            .set(headers)
            .send({ name: 'New Branch', city: 'Pune', state: 'MH' })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post('/api/v1/customers')
            .set(headers)
            .send({ fullName: 'Anita Rao', phone: '+919877700001' })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post(`/api/v1/customers/${verified.customerId}/consents`)
            .set(headers)
            .send({ purpose: 'LENDER_DATA_SHARING' })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post('/api/v1/purchases')
            .set(headers)
            .set('Idempotency-Key', 'ver-purch-1')
            .send({
              shopId: verified.shopId,
              customerId: verified.customerId,
              productCategory: 'SMARTPHONE',
              amountPaise: '2000000',
            })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post('/api/v1/checkout/sessions')
            .set(headers)
            .send({ shopId: verified.shopId, purchaseId: verified.checkoutPurchaseId })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post('/api/v1/applications')
            .set(headers)
            .set('Idempotency-Key', 'ver-app-1')
            .send({
              shopId: verified.shopId,
              purchaseId: verified.appPurchaseId,
              customerId: verified.customerId,
              requestedAmountPaise: '3000000',
            })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(app)
            .post(`/api/v1/applications/${verified.submitAppId}/submit`)
            .set(headers)
        ).status,
      ).toBe(200);

      expect(
        (
          await request(app)
            .post(`/api/v1/applications/${verified.offerAppId}/offers/${verified.offerId}/accept`)
            .set(headers)
        ).status,
      ).toBe(200);

      expect(
        (
          await request(app)
            .post(`/api/v1/applications/${verified.cancelAppId}/cancel`)
            .set(headers)
            .send({ reason: 'Merchant requested cancellation' })
        ).status,
      ).toBe(200);

      expect(
        (
          await request(app)
            .delete(`/api/v1/customers/${verified.customerId}/consents/${verified.consentId}`)
            .set(headers)
        ).status,
      ).toBe(200);
    });

    it('blocks VERIFIED-only writes for PENDING_VERIFICATION while allowing consent revoke, app cancel, and dashboard reads', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const pending = await seedMerchantScenario(stores, '3002', 'PENDING_VERIFICATION');
      const owner = await createUserWithToken(stores, authService, {
        email: 'pending-owner@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: pending.merchant.id,
      });
      const headers = { Authorization: `Bearer ${owner.accessToken}` };

      const blockedResponses = await Promise.all([
        request(app)
          .post('/api/v1/merchants/shops')
          .set(headers)
          .send({ name: 'Blocked Shop', city: 'Delhi', state: 'DL' }),
        request(app)
          .post('/api/v1/customers')
          .set(headers)
          .send({ fullName: 'Blocked Cust', phone: '+919877700002' }),
        request(app)
          .post(`/api/v1/customers/${pending.customerId}/consents`)
          .set(headers)
          .send({ purpose: 'LENDER_DATA_SHARING' }),
        request(app)
          .post('/api/v1/purchases')
          .set(headers)
          .set('Idempotency-Key', 'pend-purch-1')
          .send({
            shopId: pending.shopId,
            customerId: pending.customerId,
            productCategory: 'SMARTPHONE',
            amountPaise: '2000000',
          }),
        request(app)
          .post('/api/v1/checkout/sessions')
          .set(headers)
          .send({ shopId: pending.shopId, purchaseId: pending.checkoutPurchaseId }),
        request(app)
          .post('/api/v1/applications')
          .set(headers)
          .set('Idempotency-Key', 'pend-app-1')
          .send({
            shopId: pending.shopId,
            purchaseId: pending.appPurchaseId,
            customerId: pending.customerId,
            requestedAmountPaise: '3000000',
          }),
        request(app).post(`/api/v1/applications/${pending.submitAppId}/submit`).set(headers),
        request(app)
          .post(`/api/v1/applications/${pending.offerAppId}/offers/${pending.offerId}/accept`)
          .set(headers),
      ]);

      for (const res of blockedResponses) {
        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('PENDING_VERIFICATION');
      }

      // Allowed write exceptions for PENDING_VERIFICATION
      const cancelRes = await request(app)
        .post(`/api/v1/applications/${pending.cancelAppId}/cancel`)
        .set(headers)
        .send({ reason: 'Customer cancelled while pending verification' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.application.status).toBe('CANCELLED');

      const revokeRes = await request(app)
        .delete(`/api/v1/customers/${pending.customerId}/consents/${pending.consentId}`)
        .set(headers);
      expect(revokeRes.status).toBe(200);
      expect((await stores.consents.findById(pending.consentId))?.revokedAt).toBeInstanceOf(Date);

      // Dashboard/read endpoints remain accessible
      const readResponses = await Promise.all([
        request(app).get('/api/v1/merchants/me').set(headers),
        request(app).get('/api/v1/merchants/shops').set(headers),
        request(app).get('/api/v1/purchases').set(headers),
        request(app).get(`/api/v1/purchases/${pending.checkoutPurchaseId}`).set(headers),
        request(app).get('/api/v1/applications').set(headers),
        request(app).get(`/api/v1/applications/${pending.offerAppId}`).set(headers),
        request(app).get(`/api/v1/applications/${pending.offerAppId}/history`).set(headers),
        request(app).get(`/api/v1/applications/${pending.offerAppId}/offers`).set(headers),
        request(app).get('/api/v1/ledger/commission').set(headers),
      ]);
      for (const res of readResponses) {
        expect(res.status).toBe(200);
      }
    });

    it('blocks all 10 merchant write routes for SUSPENDED merchants while allowing dashboard reads and platform admin bypass', async () => {
      const { app, stores, authService } = buildFullTestApp();
      const suspended = await seedMerchantScenario(stores, '3003', 'SUSPENDED');
      const owner = await createUserWithToken(stores, authService, {
        email: 'suspended-owner@example.com',
        role: 'MERCHANT_OWNER',
        merchantId: suspended.merchant.id,
      });
      const adminAttachedToSuspended = await createUserWithToken(stores, authService, {
        email: 'admin-on-suspended@example.com',
        role: 'ADMIN',
        merchantId: suspended.merchant.id,
      });
      const merchantHeaders = { Authorization: `Bearer ${owner.accessToken}` };
      const adminHeaders = { Authorization: `Bearer ${adminAttachedToSuspended.accessToken}` };

      const blockedWrites = await Promise.all([
        request(app)
          .post('/api/v1/merchants/shops')
          .set(merchantHeaders)
          .send({ name: 'Blocked', city: 'Delhi', state: 'DL' }),
        request(app)
          .post('/api/v1/customers')
          .set(merchantHeaders)
          .send({ fullName: 'Blocked', phone: '+919877700003' }),
        request(app)
          .post(`/api/v1/customers/${suspended.customerId}/consents`)
          .set(merchantHeaders)
          .send({ purpose: 'LENDER_DATA_SHARING' }),
        request(app)
          .delete(`/api/v1/customers/${suspended.customerId}/consents/${suspended.consentId}`)
          .set(merchantHeaders),
        request(app)
          .post('/api/v1/purchases')
          .set(merchantHeaders)
          .set('Idempotency-Key', 'susp-purch-1')
          .send({
            shopId: suspended.shopId,
            customerId: suspended.customerId,
            productCategory: 'SMARTPHONE',
            amountPaise: '2000000',
          }),
        request(app)
          .post('/api/v1/checkout/sessions')
          .set(merchantHeaders)
          .send({ shopId: suspended.shopId, purchaseId: suspended.checkoutPurchaseId }),
        request(app)
          .post('/api/v1/applications')
          .set(merchantHeaders)
          .set('Idempotency-Key', 'susp-app-1')
          .send({
            shopId: suspended.shopId,
            purchaseId: suspended.appPurchaseId,
            customerId: suspended.customerId,
            requestedAmountPaise: '3000000',
          }),
        request(app).post(`/api/v1/applications/${suspended.submitAppId}/submit`).set(merchantHeaders),
        request(app)
          .post(`/api/v1/applications/${suspended.offerAppId}/offers/${suspended.offerId}/accept`)
          .set(merchantHeaders),
        request(app)
          .post(`/api/v1/applications/${suspended.cancelAppId}/cancel`)
          .set(merchantHeaders)
          .send({ reason: 'Blocked for suspended merchant' }),
      ]);

      for (const res of blockedWrites) {
        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('SUSPENDED');
      }

      // Consent & application remain untouched after blocked SUSPENDED attempts
      expect((await stores.consents.findById(suspended.consentId))?.revokedAt).toBeNull();
      expect((await stores.applications.findById(suspended.cancelAppId))?.status).toBe(
        'CUSTOMER_CONSENT_PENDING',
      );

      // Read/dashboard endpoints remain accessible to suspended merchant
      const reads = await Promise.all([
        request(app).get('/api/v1/merchants/me').set(merchantHeaders),
        request(app).get('/api/v1/merchants/shops').set(merchantHeaders),
        request(app).get('/api/v1/purchases').set(merchantHeaders),
        request(app).get('/api/v1/applications').set(merchantHeaders),
        request(app).get('/api/v1/ledger/commission').set(merchantHeaders),
      ]);
      for (const res of reads) {
        expect(res.status).toBe(200);
      }

      // Platform admin bypasses requireMerchantStatus even when user.merchantId points to a SUSPENDED merchant
      const adminCancelRes = await request(app)
        .post(`/api/v1/applications/${suspended.cancelAppId}/cancel`)
        .set(adminHeaders)
        .send({ reason: 'Compliance team cancellation' });
      expect(adminCancelRes.status).toBe(200);
      expect(adminCancelRes.body.data.application.status).toBe('CANCELLED');
    });

    it('rejects unauthenticated, non-merchant role, null/malformed/missing merchantId cleanly in hardened requireMerchantStatus', async () => {
      const { stores } = buildFullTestApp();
      const verified = await seedMerchantScenario(stores, '3004', 'VERIFIED');
      let merchantFindCalls = 0;
      const origMerchantFindById = stores.merchants.findById.bind(stores.merchants);
      stores.merchants.findById = async (id) => {
        merchantFindCalls += 1;
        return origMerchantFindById(id);
      };
      const middleware = requireMerchantStatus(stores, 'VERIFIED');

      const invoke = async (user?: Request['user']) => {
        const req = { user } as Request;
        let nextArg: unknown = 'NOT_CALLED';
        await middleware(req, {} as Response, (err?: unknown) => {
          nextArg = err;
        });
        return nextArg;
      };

      expect(await invoke(undefined)).toBeInstanceOf(UnauthorizedError);
      expect(
        await invoke({
          id: 'u-1',
          email: 'other@example.com',
          role: 'AUDITOR' as unknown as UserRole,
          merchantId: verified.merchant.id,
          tokenVersion: 1,
        }),
      ).toBeInstanceOf(ForbiddenError);
      expect(
        await invoke({
          id: 'u-2',
          email: 'null@example.com',
          role: 'MERCHANT_OWNER',
          merchantId: null,
          tokenVersion: 1,
        }),
      ).toBeInstanceOf(ForbiddenError);
      expect(
        await invoke({
          id: 'u-3',
          email: 'bad@example.com',
          role: 'MERCHANT_OWNER',
          merchantId: 'not-a-uuid',
          tokenVersion: 1,
        }),
      ).toBeInstanceOf(ForbiddenError);

      // Invalid role, null merchantId, and malformed UUID never hit stores.merchants.findById
      expect(merchantFindCalls).toBe(0);

      expect(
        await invoke({
          id: 'u-4',
          email: 'missing@example.com',
          role: 'MERCHANT_OWNER',
          merchantId: '00000000-0000-4000-8000-000000000999',
          tokenVersion: 1,
        }),
      ).toBeInstanceOf(ForbiddenError);
      expect(merchantFindCalls).toBe(1);

      expect(
        await invoke({
          id: 'u-5',
          email: 'ok@example.com',
          role: 'MERCHANT_OWNER',
          merchantId: verified.merchant.id,
          tokenVersion: 1,
        }),
      ).toBeUndefined();
    });
  });

  describe('PrismaStore-backed Batch 1B enforcement (mocked PrismaClient)', () => {
    function buildPrismaMockHarness() {
      const users = new Map<string, UserEntity>();
      const merchants = new Map<string, MerchantEntity>();
      const shops = new Map<string, ShopEntity>();
      const customers = new Map<string, CustomerEntity>();
      const consents = new Map<string, CustomerConsentEntity>();
      const purchases = new Map<string, PurchaseEntity>();
      const applications = new Map<string, FinancingApplicationEntity>();
      const appHistory: ApplicationStatusHistoryEntity[] = [];

      let merchantFindUniqueCalls = 0;
      let customerFindUniqueCalls = 0;
      let consentFindUniqueCalls = 0;
      let consentUpdateCalls = 0;
      let shopFindUniqueCalls = 0;
      let purchaseCreateCalls = 0;
      let applicationUpdateCalls = 0;
      let nextSeq = 1;

      interface MockPrismaClient {
        user: {
          findUnique: (args: { where: { id?: string; email?: string } }) => Promise<UserEntity | null>;
        };
        merchant: {
          findUnique: (args: { where: { id: string } }) => Promise<MerchantEntity | null>;
        };
        shop: {
          findUnique: (args: { where: { id: string } }) => Promise<ShopEntity | null>;
        };
        customer: {
          findUnique: (args: { where: { id: string } }) => Promise<CustomerEntity | null>;
        };
        customerConsent: {
          findUnique: (args: { where: { id: string } }) => Promise<CustomerConsentEntity | null>;
          findFirst: (args: {
            where: { customerId: string; purpose: string; revokedAt: null };
          }) => Promise<CustomerConsentEntity | null>;
          update: (args: {
            where: { id: string };
            data: { revokedAt: Date };
          }) => Promise<CustomerConsentEntity>;
        };
        purchase: {
          create: (args: {
            data: Omit<PurchaseEntity, 'id' | 'createdAt' | 'updatedAt'>;
          }) => Promise<PurchaseEntity>;
          findUnique: (args: {
            where: {
              id?: string;
              merchantId_idempotencyKey?: { merchantId: string; idempotencyKey: string };
            };
          }) => Promise<PurchaseEntity | null>;
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
        $transaction: <T>(fn: (tx: MockPrismaClient) => Promise<T>) => Promise<T>;
      }

      const mockPrisma: MockPrismaClient = {
        user: {
          findUnique: async ({ where }) => {
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
        },
        shop: {
          findUnique: async ({ where }) => {
            shopFindUniqueCalls += 1;
            return shops.get(where.id) ?? null;
          },
        },
        customer: {
          findUnique: async ({ where }) => {
            customerFindUniqueCalls += 1;
            return customers.get(where.id) ?? null;
          },
        },
        customerConsent: {
          findUnique: async ({ where }) => {
            consentFindUniqueCalls += 1;
            return consents.get(where.id) ?? null;
          },
          findFirst: async ({ where }) => {
            for (const c of consents.values()) {
              if (
                c.customerId === where.customerId &&
                c.purpose === where.purpose &&
                c.revokedAt === null
              ) {
                return c;
              }
            }
            return null;
          },
          update: async ({ where, data }) => {
            consentUpdateCalls += 1;
            const existing = consents.get(where.id)!;
            const updated: CustomerConsentEntity = { ...existing, revokedAt: data.revokedAt };
            consents.set(where.id, updated);
            return updated;
          },
        },
        purchase: {
          create: async ({ data }) => {
            purchaseCreateCalls += 1;
            for (const existing of purchases.values()) {
              if (
                existing.merchantId === data.merchantId &&
                existing.idempotencyKey === data.idempotencyKey
              ) {
                throw Object.assign(new Error('Unique violation'), { code: 'P2002' });
              }
            }
            const created: PurchaseEntity = {
              ...data,
              id: `00000000-0000-4000-8000-${String(nextSeq++).padStart(12, '0')}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            purchases.set(created.id, created);
            return created;
          },
          findUnique: async ({ where }) => {
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
            return null;
          },
        },
        financingApplication: {
          findUnique: async ({ where }) => applications.get(where.id) ?? null,
          update: async ({ where, data }) => {
            applicationUpdateCalls += 1;
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
            applicationUpdateCalls += 1;
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
              id: `00000000-0000-4000-8000-${String(appHistory.length + 100).padStart(12, '0')}`,
              createdAt: new Date(),
            };
            appHistory.push(entry);
            return entry;
          },
        },
        $transaction: async <T>(fn: (tx: MockPrismaClient) => Promise<T>): Promise<T> => fn(mockPrisma),
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

      const app = createApp({
        config,
        logger: pino({ level: 'silent' }),
        readinessCheck: () => Promise.resolve(),
        routerDeps: {
          stores,
          authService,
          tokenService: authService.getTokenService(),
          checkoutService: new CheckoutService(stores),
          applicationService: new ApplicationService(stores),
          offerService: new OfferService(stores),
          webhookService: new WebhookService(stores, config.WEBHOOK_DEFAULT_TOLERANCE_SECONDS),
          commissionService: new CommissionService(stores),
          adminService: new AdminService(stores),
        },
      });

      return {
        app,
        stores,
        tokenService: authService.getTokenService(),
        records: { users, merchants, shops, customers, consents, purchases, applications },
        counts: {
          merchantFindUniqueCalls: () => merchantFindUniqueCalls,
          customerFindUniqueCalls: () => customerFindUniqueCalls,
          consentFindUniqueCalls: () => consentFindUniqueCalls,
          consentUpdateCalls: () => consentUpdateCalls,
          shopFindUniqueCalls: () => shopFindUniqueCalls,
          purchaseCreateCalls: () => purchaseCreateCalls,
          applicationUpdateCalls: () => applicationUpdateCalls,
        },
      };
    }

    it('enforces consent IDOR, purchase ownership, and merchant status rules via PrismaStore without unwanted DB mutations', async () => {
      const ctx = buildPrismaMockHarness();
      const now = new Date();
      const mVerifiedId = '11111111-1111-4111-8111-111111111111';
      const mPendingId = '22222222-2222-4222-8222-222222222222';
      const mSuspendedId = '33333333-3333-4333-8333-333333333333';

      const uVerifiedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const uPendingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const uSuspendedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const uBadMidId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const uAdminId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

      const shopVerId = '44444444-4444-4444-8444-444444444444';
      const shopPendId = '55555555-5555-4555-8555-555555555555';
      const custVerId = '66666666-6666-4666-8666-666666666666';
      const custVer2Id = '67676767-6767-4676-8676-676767676767';
      const custPendId = '77777777-7777-4777-8777-777777777777';
      const custSuspId = '88888888-8888-4888-8888-888888888888';

      const consentVerId = '91919191-9191-4919-8919-919191919191';
      const consentVer2Id = '92929292-9292-4929-8929-929292929292';
      const consentPendId = '93939393-9393-4939-8939-939393939393';
      const consentSuspId = '94949494-9494-4949-8949-949494949494';
      const appSuspCancelId = '95959595-9595-4959-8959-959595959595';

      ctx.records.merchants.set(mVerifiedId, {
        id: mVerifiedId,
        legalName: 'Verified Co',
        tradeName: 'Verified',
        status: 'VERIFIED',
        verifiedAt: now,
        suspendedAt: null,
        suspensionReason: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.merchants.set(mPendingId, {
        id: mPendingId,
        legalName: 'Pending Co',
        tradeName: 'Pending',
        status: 'PENDING_VERIFICATION',
        verifiedAt: null,
        suspendedAt: null,
        suspensionReason: null,
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.merchants.set(mSuspendedId, {
        id: mSuspendedId,
        legalName: 'Suspended Co',
        tradeName: 'Suspended',
        status: 'SUSPENDED',
        verifiedAt: null,
        suspendedAt: now,
        suspensionReason: 'Risk',
        createdAt: now,
        updatedAt: now,
      });

      const addUser = (id: string, email: string, role: UserRole, merchantId: string | null) => {
        ctx.records.users.set(id, {
          id,
          email,
          passwordHash: 'hash',
          role,
          status: 'ACTIVE',
          merchantId,
          tokenVersion: 1,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now,
        });
      };

      addUser(uVerifiedId, 'p-ver@example.com', 'MERCHANT_OWNER', mVerifiedId);
      addUser(uPendingId, 'p-pend@example.com', 'MERCHANT_OWNER', mPendingId);
      addUser(uSuspendedId, 'p-susp@example.com', 'MERCHANT_OWNER', mSuspendedId);
      addUser(uBadMidId, 'p-bad@example.com', 'MERCHANT_OWNER', 'not-a-uuid');
      addUser(uAdminId, 'p-adm@example.com', 'ADMIN', mSuspendedId);

      ctx.records.shops.set(shopVerId, {
        id: shopVerId,
        merchantId: mVerifiedId,
        name: 'Verified Shop',
        city: 'BLR',
        state: 'KA',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
      ctx.records.shops.set(shopPendId, {
        id: shopPendId,
        merchantId: mPendingId,
        name: 'Pending Shop',
        city: 'BLR',
        state: 'KA',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });

      const addCustomer = (id: string, merchantId: string, phone: string) => {
        ctx.records.customers.set(id, {
          id,
          merchantId,
          fullName: `Cust ${phone}`,
          phone,
          retentionExpiresAt: new Date(now.getTime() + 86400000),
          anonymizedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      };
      addCustomer(custVerId, mVerifiedId, '+919800000001');
      addCustomer(custVer2Id, mVerifiedId, '+919800000002');
      addCustomer(custPendId, mPendingId, '+919800000003');
      addCustomer(custSuspId, mSuspendedId, '+919800000004');

      const addConsent = (id: string, merchantId: string, customerId: string) => {
        ctx.records.consents.set(id, {
          id,
          merchantId,
          customerId,
          purpose: 'FINANCING_APPLICATION_PROCESSING',
          noticeVersion: 'v1.0',
          captureMethod: 'CUSTOMER_CHECKOUT_SESSION',
          grantedAt: now,
          revokedAt: null,
          createdAt: now,
        });
      };
      addConsent(consentVerId, mVerifiedId, custVerId);
      addConsent(consentVer2Id, mVerifiedId, custVer2Id);
      addConsent(consentPendId, mPendingId, custPendId);
      addConsent(consentSuspId, mSuspendedId, custSuspId);

      ctx.records.applications.set(appSuspCancelId, {
        id: appSuspCancelId,
        merchantId: mSuspendedId,
        shopId: shopPendId,
        purchaseId: '96969696-9696-4969-8969-969696969696',
        customerId: custSuspId,
        createdByUserId: uSuspendedId,
        status: 'CUSTOMER_CONSENT_PENDING',
        routingMode: 'SEQUENTIAL',
        requestedAmountPaise: 1000000n,
        downPaymentPaise: 0n,
        requestedTenureMonths: 6,
        idempotencyKey: 'prisma-susp-app',
        version: 1,
        submittedAt: null,
        expiresAt: new Date(now.getTime() + 86400000),
        terminalAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const verToken = ctx.tokenService.signAccessToken({
        userId: uVerifiedId,
        role: 'MERCHANT_OWNER',
        merchantId: mVerifiedId,
        tokenVersion: 1,
      });
      const pendToken = ctx.tokenService.signAccessToken({
        userId: uPendingId,
        role: 'MERCHANT_OWNER',
        merchantId: mPendingId,
        tokenVersion: 1,
      });
      const suspToken = ctx.tokenService.signAccessToken({
        userId: uSuspendedId,
        role: 'MERCHANT_OWNER',
        merchantId: mSuspendedId,
        tokenVersion: 1,
      });
      const badMidToken = ctx.tokenService.signAccessToken({
        userId: uBadMidId,
        role: 'MERCHANT_OWNER',
        merchantId: 'not-a-uuid',
        tokenVersion: 1,
      });
      const adminToken = ctx.tokenService.signAccessToken({
        userId: uAdminId,
        role: 'ADMIN',
        merchantId: mSuspendedId,
        tokenVersion: 1,
      });

      // 1. PrismaStore.consents.findById works and malformed merchantId short-circuits before Prisma merchant lookup
      expect((await ctx.stores.consents.findById(consentVerId))?.id).toBe(consentVerId);
      expect(await ctx.stores.consents.findById('00000000-0000-4000-8000-000000009999')).toBeNull();

      const badMidShopRes = await request(ctx.app)
        .post('/api/v1/merchants/shops')
        .set('Authorization', `Bearer ${badMidToken}`)
        .send({ name: 'X', city: 'Y', state: 'Z' });
      expect(badMidShopRes.status).toBe(403);
      expect(ctx.counts.merchantFindUniqueCalls()).toBe(0);

      // 2. Consent UUID validation short-circuits before Prisma customer/consent lookup
      const badCustomerParamRes = await request(ctx.app)
        .delete(`/api/v1/customers/bad-id/consents/${consentVerId}`)
        .set('Authorization', `Bearer ${verToken}`);
      expect(badCustomerParamRes.status).toBe(400);

      const badConsentParamRes = await request(ctx.app)
        .delete(`/api/v1/customers/${custVerId}/consents/bad-consent-id`)
        .set('Authorization', `Bearer ${verToken}`);
      expect(badConsentParamRes.status).toBe(400);

      expect(ctx.counts.customerFindUniqueCalls()).toBe(0);
      expect(ctx.counts.consentFindUniqueCalls()).toBe(2); // Only the 2 direct findById calls above

      // 3. Consent IDOR via PrismaStore returns 404 without calling customerConsent.update
      const wrongCustPrisma = await request(ctx.app)
        .delete(`/api/v1/customers/${custVerId}/consents/${consentVer2Id}`)
        .set('Authorization', `Bearer ${verToken}`);
      expect(wrongCustPrisma.status).toBe(404);
      expect(wrongCustPrisma.body.error.message).toBe('Consent not found');
      expect(ctx.counts.consentUpdateCalls()).toBe(0);

      const crossMerchantPrisma = await request(ctx.app)
        .delete(`/api/v1/customers/${custVerId}/consents/${consentPendId}`)
        .set('Authorization', `Bearer ${verToken}`);
      expect(crossMerchantPrisma.status).toBe(404);
      expect(ctx.counts.consentUpdateCalls()).toBe(0);

      // 4. Valid consent revoke works for PENDING_VERIFICATION and VERIFIED, blocked for SUSPENDED
      const pendRevoke = await request(ctx.app)
        .delete(`/api/v1/customers/${custPendId}/consents/${consentPendId}`)
        .set('Authorization', `Bearer ${pendToken}`);
      expect(pendRevoke.status).toBe(200);
      expect(ctx.counts.consentUpdateCalls()).toBe(1);

      const suspRevoke = await request(ctx.app)
        .delete(`/api/v1/customers/${custSuspId}/consents/${consentSuspId}`)
        .set('Authorization', `Bearer ${suspToken}`);
      expect(suspRevoke.status).toBe(403);
      expect(ctx.counts.consentUpdateCalls()).toBe(1);

      // 5. Purchase gating & ownership via PrismaStore
      const pendPurchase = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${pendToken}`)
        .set('Idempotency-Key', 'p-pend-1')
        .send({ shopId: shopPendId, productCategory: 'SMARTPHONE', amountPaise: '100000' });
      expect(pendPurchase.status).toBe(403);
      expect(ctx.counts.shopFindUniqueCalls()).toBe(0);
      expect(ctx.counts.purchaseCreateCalls()).toBe(0);

      const foreignShopPurchase = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${verToken}`)
        .set('Idempotency-Key', 'p-foreign-shop')
        .send({
          shopId: shopPendId,
          customerId: custVerId,
          productCategory: 'SMARTPHONE',
          amountPaise: '100000',
        });
      expect(foreignShopPurchase.status).toBe(403);
      expect(foreignShopPurchase.body.error.message).toBe('Shop does not belong to this merchant');
      expect(ctx.counts.purchaseCreateCalls()).toBe(0);

      const foreignCustomerPurchase = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${verToken}`)
        .set('Idempotency-Key', 'p-foreign-cust')
        .send({
          shopId: shopVerId,
          customerId: custPendId,
          productCategory: 'SMARTPHONE',
          amountPaise: '100000',
        });
      expect(foreignCustomerPurchase.status).toBe(403);
      expect(foreignCustomerPurchase.body.error.message).toBe(
        'Customer does not belong to this merchant',
      );
      expect(ctx.counts.purchaseCreateCalls()).toBe(0);

      const validPurchase = await request(ctx.app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${verToken}`)
        .set('Idempotency-Key', 'p-valid-1')
        .send({
          shopId: shopVerId,
          customerId: custVerId,
          productCategory: 'SMARTPHONE',
          amountPaise: '100000',
        });
      expect(validPurchase.status).toBe(201);
      expect(ctx.counts.purchaseCreateCalls()).toBe(1);

      // 6. Suspended merchant cannot cancel, while platform admin with suspended merchantId bypasses status gate
      const suspCancel = await request(ctx.app)
        .post(`/api/v1/applications/${appSuspCancelId}/cancel`)
        .set('Authorization', `Bearer ${suspToken}`)
        .send({ reason: 'Blocked' });
      expect(suspCancel.status).toBe(403);
      expect(ctx.counts.applicationUpdateCalls()).toBe(0);

      const adminCancel = await request(ctx.app)
        .post(`/api/v1/applications/${appSuspCancelId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Admin compliance cancellation' });
      expect(adminCancel.status).toBe(200);
      expect(ctx.counts.applicationUpdateCalls()).toBe(1);
    });
  });
});
