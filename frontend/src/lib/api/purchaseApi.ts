import { apiClient } from '@/lib/api/client';
import type { PaginationMeta, ProductCategory, Purchase } from '@/types/api';

export interface CreatePurchasePayload {
  shopId: string;
  customerId?: string;
  productCategory: ProductCategory;
  productDescription?: string;
  amountPaise: string;
  currency?: string;
  idempotencyKey: string;
}

export const purchaseApi = {
  async createPurchase(payload: CreatePurchasePayload): Promise<Purchase> {
    const res = await apiClient.post<{ purchase: Purchase }>(
      '/api/v1/purchases',
      {
        ...payload,
        currency: payload.currency ?? 'INR',
      },
      { idempotencyKey: payload.idempotencyKey },
    );
    return res.data.purchase;
  },

  async listPurchases(
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<{ items: Purchase[]; meta: PaginationMeta }> {
    const res = await apiClient.get<Purchase[]>(
      `/api/v1/purchases?page=${page}&pageSize=${pageSize}`,
      { signal },
    );
    return {
      items: res.data,
      meta: res.meta ?? { page, pageSize, total: res.data.length },
    };
  },

  async getPurchase(id: string, signal?: AbortSignal): Promise<Purchase> {
    const res = await apiClient.get<{ purchase: Purchase }>(`/api/v1/purchases/${id}`, { signal });
    return res.data.purchase;
  },
};

