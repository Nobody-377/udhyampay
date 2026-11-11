import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../../common/errors';
import { sendSuccess } from '../../common/response';
import { requireAuthenticatedMerchantId, requireMerchantStatus } from '../auth/auth.middleware';
import type { AppStores } from '../persistence/stores';

const deleteConsentParamsSchema = z.object({
  id: z.string().uuid('Customer id must be a valid UUID'),
  consentId: z.string().uuid('Consent id must be a valid UUID'),
});

const registerCustomerSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be valid E.164 phone number, e.g. +919876543210'),
  consentNoticeVersion: z.string().default('v1.0'),
  captureMethod: z.enum(['CUSTOMER_CHECKOUT_SESSION', 'MERCHANT_ASSISTED']).default('CUSTOMER_CHECKOUT_SESSION'),
});

const grantConsentSchema = z.object({
  purpose: z.enum(['FINANCING_APPLICATION_PROCESSING', 'LENDER_DATA_SHARING']),
  noticeVersion: z.string().default('v1.0'),
  captureMethod: z.enum(['CUSTOMER_CHECKOUT_SESSION', 'MERCHANT_ASSISTED']).default('CUSTOMER_CHECKOUT_SESSION'),
});

export function createCustomerRouter(stores: AppStores): Router {
  const router = Router();

  router.post('/', requireMerchantStatus(stores, 'VERIFIED'), async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    const body = registerCustomerSchema.parse(req.body);

    let customer = await stores.customers.findByPhone(merchantId, body.phone);
    if (!customer) {
      customer = await stores.customers.create({
        merchantId,
        fullName: body.fullName,
        phone: body.phone,
        retentionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year retention
        anonymizedAt: null,
      });
    }

    // Record consent
    const consent = await stores.consents.create({
      merchantId,
      customerId: customer.id,
      purpose: 'FINANCING_APPLICATION_PROCESSING',
      noticeVersion: body.consentNoticeVersion,
      captureMethod: body.captureMethod,
      grantedAt: new Date(),
      revokedAt: null,
    });

    sendSuccess(res, { customer, consent }, { status: 201 });
  });

  router.post('/:id/consents', requireMerchantStatus(stores, 'VERIFIED'), async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    const customer = await stores.customers.findById(req.params.id!);
    if (!customer || customer.merchantId !== merchantId) {
      throw new NotFoundError('Customer not found');
    }

    const body = grantConsentSchema.parse(req.body);
    const consent = await stores.consents.create({
      merchantId,
      customerId: customer.id,
      purpose: body.purpose,
      noticeVersion: body.noticeVersion,
      captureMethod: body.captureMethod,
      grantedAt: new Date(),
      revokedAt: null,
    });

    sendSuccess(res, { consent }, { status: 201 });
  });

  router.delete(
    '/:id/consents/:consentId',
    requireMerchantStatus(stores, 'PENDING_VERIFICATION', 'VERIFIED'),
    async (req: Request, res: Response) => {
      const merchantId = await requireAuthenticatedMerchantId(req, stores);
      const { id: customerId, consentId } = deleteConsentParamsSchema.parse(req.params);

      const customer = await stores.customers.findById(customerId);
      if (!customer || customer.merchantId !== merchantId) {
        throw new NotFoundError('Customer not found');
      }

      const consent = await stores.consents.findById(consentId);
      if (!consent || consent.customerId !== customer.id || consent.merchantId !== merchantId) {
        throw new NotFoundError('Consent not found');
      }

      await stores.consents.revoke(consent.id);
      sendSuccess(res, { message: 'Consent revoked successfully' });
    },
  );

  return router;
}

