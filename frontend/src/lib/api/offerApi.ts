import { apiClient } from '@/lib/api/client';
import type { FinancingOffer } from '@/types/api';

export interface AcceptOfferResponse {
  offer: FinancingOffer;
  applicationStatus: string;
}

export const offerApi = {
  async listOffers(applicationId: string, signal?: AbortSignal): Promise<FinancingOffer[]> {
    const res = await apiClient.get<FinancingOffer[]>(
      `/api/v1/applications/${applicationId}/offers`,
      { signal },
    );
    return res.data;
  },

  async acceptOffer(applicationId: string, offerId: string): Promise<AcceptOfferResponse> {
    const res = await apiClient.post<AcceptOfferResponse>(
      `/api/v1/applications/${applicationId}/offers/${offerId}/accept`,
      {},
    );
    return res.data;
  },
};

