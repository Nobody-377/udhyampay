import { Router, type Request, type RequestHandler, type Response } from 'express';
import { sendSuccess } from '../../common/response';
import {
  requireAuthenticatedMerchantId,
  requireMerchantStatus,
  resolveMerchantOrAdminScope,
} from '../auth/auth.middleware';
import type { AppStores } from '../persistence/stores';
import type { OfferService } from './offer.service';

export function createOfferRouter(offerService: OfferService, stores?: AppStores): Router {
  const router = Router();
  const verifiedMerchantHandlers: RequestHandler[] = stores
    ? [requireMerchantStatus(stores, 'VERIFIED')]
    : [];

  router.get('/applications/:id/offers', async (req: Request, res: Response) => {
    const { merchantId } = await resolveMerchantOrAdminScope(req, stores);
    const offers = await offerService.listOffers(
      req.params.id!,
      merchantId,
    );

    sendSuccess(
      res,
      offers.map((o) => ({
        ...o,
        principalPaise: o.principalPaise.toString(),
        emiPaise: o.emiPaise.toString(),
        totalRepayablePaise: o.totalRepayablePaise?.toString(),
        processingFeePaise: o.processingFeePaise?.toString(),
      })),
    );
  });

  router.post(
    '/applications/:id/offers/:offerId/accept',
    ...verifiedMerchantHandlers,
    async (req: Request, res: Response) => {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    const result = await offerService.acceptOffer({
      applicationId: req.params.id!,
      offerId: req.params.offerId!,
      merchantId,
      customerId: undefined,
      actorType: 'MERCHANT_USER',
      actorId: req.user?.id,
    });

    sendSuccess(res, {
      offer: {
        ...result.offer,
        principalPaise: result.offer.principalPaise.toString(),
        emiPaise: result.offer.emiPaise.toString(),
        downPaymentPaise: result.offer.downPaymentPaise?.toString() ?? null,
        processingFeePaise: result.offer.processingFeePaise?.toString() ?? null,
        totalRepayablePaise: result.offer.totalRepayablePaise?.toString() ?? null,
      },
      applicationStatus: result.applicationStatus,
    });
  });

  return router;
}

