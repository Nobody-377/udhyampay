import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ForbiddenError, UnauthorizedError } from '../../common/errors';
import { sendSuccess } from '../../common/response';
import {
  isMerchantRole,
  isPlatformAdminRole,
  requireAuthenticatedMerchantId,
  requireMerchantEntityExistsOrNotFound,
} from '../auth/auth.middleware';
import type { AppStores } from '../persistence/stores';
import type { CommissionService } from './commission.service';

const adminCommissionQuerySchema = z.object({
  merchantId: z.string().uuid('merchantId must be a valid UUID'),
});

export function createLedgerRouter(
  commissionService: CommissionService,
  stores?: AppStores,
): Router {
  const router = Router();

  router.get('/commission', async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    let merchantId: string;

    if (isMerchantRole(req.user.role)) {
      merchantId = await requireAuthenticatedMerchantId(req, stores);
    } else if (isPlatformAdminRole(req.user.role)) {
      const rawMerchantId = req.query.merchantId;
      if (rawMerchantId === undefined || rawMerchantId === '') {
        throw new ForbiddenError('merchantId query parameter is required for platform administrators');
      }

      const parsed = adminCommissionQuerySchema.parse({ merchantId: rawMerchantId });
      if (stores) {
        const merchant = await stores.merchants.findById(parsed.merchantId);
        requireMerchantEntityExistsOrNotFound(merchant);
      }
      merchantId = parsed.merchantId;
    } else {
      throw new ForbiddenError('Merchant or Admin authorization required');
    }

    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
    const take = req.query.take ? parseInt(req.query.take as string, 10) : 50;

    const summary = await commissionService.getMerchantSummary(merchantId, skip, take);

    sendSuccess(res, {
      summary: {
        totalAccruedPaise: summary.totalAccruedPaise.toString(),
        totalReversedPaise: summary.totalReversedPaise.toString(),
        netCommissionPaise: summary.netCommissionPaise.toString(),
        entries: summary.entries.map((e) => ({
          ...e,
          amountPaise: e.amountPaise.toString(),
        })),
      },
    });
  });

  return router;
}

