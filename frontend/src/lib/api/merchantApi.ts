import { apiClient } from '@/lib/api/client';
import type { Merchant, Shop } from '@/types/api';

export interface CreateShopPayload {
  name: string;
  city: string;
  state: string;
}

export const merchantApi = {
  async getMe(signal?: AbortSignal): Promise<Merchant> {
    const res = await apiClient.get<{ merchant: Merchant }>('/api/v1/merchants/me', { signal });
    return res.data.merchant;
  },

  async listShops(signal?: AbortSignal): Promise<Shop[]> {
    const res = await apiClient.get<{ shops: Shop[] }>('/api/v1/merchants/shops', { signal });
    return res.data.shops;
  },

  async createShop(payload: CreateShopPayload): Promise<Shop> {
    const res = await apiClient.post<{ shop: Shop }>('/api/v1/merchants/shops', payload);
    return res.data.shop;
  },
};

