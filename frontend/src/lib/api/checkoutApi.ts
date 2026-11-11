import { apiClient } from '@/lib/api/client';
import type { CheckoutSessionCreateResponse, CheckoutSessionPublicView } from '@/types/api';

export interface CreateCheckoutSessionPayload {
  shopId: string;
  purchaseId: string;
  validityMinutes?: number;
}

export const checkoutApi = {
  async createSession(payload: CreateCheckoutSessionPayload): Promise<CheckoutSessionCreateResponse> {
    const res = await apiClient.post<CheckoutSessionCreateResponse>(
      '/api/v1/checkout/sessions',
      payload,
    );
    return res.data;
  },

  async getPublicSession(token: string, signal?: AbortSignal): Promise<CheckoutSessionPublicView> {
    const res = await apiClient.get<CheckoutSessionPublicView>(
      `/api/v1/checkout/sessions/${encodeURIComponent(token)}`,
      { skipAuth: true, signal },
    );
    return res.data;
  },
};

