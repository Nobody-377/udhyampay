import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../common/response';
import {
  requireAuthenticatedMerchantId,
  requireMerchantEntityExistsOrNotFound,
  requireMerchantStatus,
} from '../auth/auth.middleware';
import type { AppStores } from '../persistence/stores';

const createShopSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2),
});

export function createMerchantRouter(stores: AppStores): Router {
  const router = Router();

  router.get('/me', async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores, {
      allowMissingEntityForSelfLookup: true,
    });
    const merchant = requireMerchantEntityExistsOrNotFound(
      await stores.merchants.findById(merchantId),
    );
    sendSuccess(res, { merchant });
  });

  router.post('/shops', requireMerchantStatus(stores, 'VERIFIED'), async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    const body = createShopSchema.parse(req.body);
    const shop = await stores.shops.create({
      merchantId,
      name: body.name,
      city: body.city,
      state: body.state,
      status: 'ACTIVE',
    });
    sendSuccess(res, { shop }, { status: 201 });
  });

  router.get('/shops', async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    const shops = await stores.shops.listByMerchant(merchantId);
    sendSuccess(res, { shops });
  });

  return router;
}

