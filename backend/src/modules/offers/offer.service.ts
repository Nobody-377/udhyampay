import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { assertTransition } from '../applications/application-state-machine';
import type {
  ActorType,
  AppStores,
  FinancingOfferEntity,
} from '../persistence/stores';

export interface AcceptOfferParams {
  applicationId: string;
  offerId: string;
  merchantId?: string;
  customerId?: string;
  actorType: ActorType;
  actorId?: string;
}

export class OfferService {
  constructor(private readonly stores: AppStores) {}

  async listOffers(
    applicationId: string,
    merchantId?: string,
  ): Promise<FinancingOfferEntity[]> {
    const app = await this.stores.applications.findById(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (merchantId && app.merchantId !== merchantId) {
      throw new ForbiddenError('Access denied: merchant mismatch');
    }

    return this.stores.offers.listByApplication(applicationId, 'ACTIVE');
  }

  async getOffer(offerId: string): Promise<FinancingOfferEntity> {
    const offer = await this.stores.offers.findById(offerId);
    if (!offer) throw new NotFoundError('Offer not found');
    return offer;
  }

  async acceptOffer(params: AcceptOfferParams): Promise<{ offer: FinancingOfferEntity; applicationStatus: string }> {
    const { applicationId, offerId, merchantId, customerId, actorType, actorId } = params;

    const executeAccept = async (txStores: AppStores) => {
      const app = await txStores.applications.findById(applicationId);
      if (!app) throw new NotFoundError('Application not found');

      if (merchantId && app.merchantId !== merchantId) {
        throw new ForbiddenError('Access denied: merchant mismatch');
      }

      if (customerId && app.customerId !== customerId) {
        throw new ForbiddenError('Offer does not belong to this customer');
      }

      const offer = await txStores.offers.findById(offerId);
      if (!offer) throw new NotFoundError('Offer not found');

      if (offer.applicationId !== applicationId) {
        throw new ConflictError('Offer does not belong to this financing application');
      }

      if (offer.status !== 'ACTIVE') {
        throw new ConflictError(`Offer is not active (status: ${offer.status})`);
      }

      if (offer.expiresAt && offer.expiresAt < new Date()) {
        return { expiredOfferId: offer.id } as const;
      }

      // Enforce state machine: OFFER_AVAILABLE -> CUSTOMER_ACCEPTED_OFFER
      assertTransition(app.status, 'CUSTOMER_ACCEPTED_OFFER', {
        actor: actorType,
      });

      // Mark accepted offer
      await txStores.offers.updateStatus(offer.id, 'ACCEPTED');

      // Supersede all other active offers for this application
      await txStores.offers.supersedeOthers(applicationId, offer.id);

      // Transition application to CUSTOMER_ACCEPTED_OFFER
      const updatedApp = await txStores.applications.updateStatus({
        id: app.id,
        expectedVersion: app.version,
        toStatus: 'CUSTOMER_ACCEPTED_OFFER',
        actorType,
        actorId,
        reason: `Customer accepted offer ${offer.lenderOfferReference} (${offer.tenureMonths}M EMI)`,
        metadata: {
          offerId: offer.id,
          tenureMonths: offer.tenureMonths,
          emiPaise: offer.emiPaise.toString(),
        },
      });

      return {
        expiredOfferId: null,
        offer: { ...offer, status: 'ACCEPTED' as const },
        applicationStatus: updatedApp.status,
      } as const;
    };

    const outcome = this.stores.runInTransaction
      ? await this.stores.runInTransaction(executeAccept)
      : await executeAccept(this.stores);

    if (outcome.expiredOfferId !== null) {
      await this.stores.offers.updateStatus(outcome.expiredOfferId, 'EXPIRED');
      throw new ConflictError('Offer has expired');
    }

    return {
      offer: outcome.offer,
      applicationStatus: outcome.applicationStatus,
    };
  }
}

