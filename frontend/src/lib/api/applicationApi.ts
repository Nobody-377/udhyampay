import { apiClient } from '@/lib/api/client';
import type {
  ApplicationDetailsResponse,
  ApplicationStatusHistoryEntry,
  FinancingApplication,
  PaginationMeta,
  RoutingMode,
} from '@/types/api';

export interface CreateApplicationPayload {
  shopId: string;
  purchaseId: string;
  customerId: string;
  requestedAmountPaise: string;
  downPaymentPaise?: string;
  requestedTenureMonths?: number;
  routingMode?: RoutingMode;
  idempotencyKey?: string;
}

export const applicationApi = {
  async createApplication(payload: CreateApplicationPayload): Promise<FinancingApplication> {
    const res = await apiClient.post<{ application: FinancingApplication }>(
      '/api/v1/applications',
      payload,
      payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
    );
    return res.data.application;
  },

  async submitApplication(id: string): Promise<FinancingApplication> {
    const res = await apiClient.post<{ application: FinancingApplication }>(
      `/api/v1/applications/${id}/submit`,
      {},
    );
    return res.data.application;
  },

  async cancelApplication(id: string, reason: string): Promise<FinancingApplication> {
    const res = await apiClient.post<{ application: FinancingApplication }>(
      `/api/v1/applications/${id}/cancel`,
      { reason },
    );
    return res.data.application;
  },

  async listApplications(
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ): Promise<{ items: FinancingApplication[]; meta: PaginationMeta }> {
    const res = await apiClient.get<FinancingApplication[]>(
      `/api/v1/applications?page=${page}&pageSize=${pageSize}`,
      { signal },
    );
    return {
      items: res.data,
      meta: res.meta ?? { page, pageSize, total: res.data.length },
    };
  },

  async getApplication(id: string, signal?: AbortSignal): Promise<ApplicationDetailsResponse> {
    const res = await apiClient.get<ApplicationDetailsResponse>(`/api/v1/applications/${id}`, {
      signal,
    });
    return res.data;
  },

  async getHistory(id: string, signal?: AbortSignal): Promise<ApplicationStatusHistoryEntry[]> {
    const res = await apiClient.get<{ history: ApplicationStatusHistoryEntry[] }>(
      `/api/v1/applications/${id}/history`,
      { signal },
    );
    return res.data.history;
  },
};

