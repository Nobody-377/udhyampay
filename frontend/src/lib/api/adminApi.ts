import { apiClient } from '@/lib/api/client';
import type {
  AuditLogEntry,
  FinancingApplication,
  LenderConfiguration,
  Merchant,
  PaginationMeta,
  ProductCategory,
} from '@/types/api';

export interface UpdateLenderConfigPayload {
  enabled?: boolean;
  priority?: number;
  supportsDiscovery?: boolean;
  fallbackOnDecline?: boolean;
  requestTimeoutMs?: number;
  maxSafeRetries?: number;
  supportedCategories?: ProductCategory[];
  /**
   * Note: Backend `PUT /api/v1/admin/lenders/:id/config` currently passes
   * `req.body` directly to Prisma without JSON-to-BigInt coercion. Only include
   * supported primitive fields unless backend Zod coercion is added.
   */
}

export const adminApi = {
  async updateMerchantStatus(
    merchantId: string,
    payload: { status: 'VERIFIED' | 'SUSPENDED'; reason?: string },
  ): Promise<Merchant> {
    const res = await apiClient.patch<{ merchant: Merchant }>(
      `/api/v1/admin/merchants/${merchantId}/status`,
      payload,
    );
    return res.data.merchant;
  },

  async updateLenderConfig(
    lenderId: string,
    payload: UpdateLenderConfigPayload,
  ): Promise<LenderConfiguration> {
    const res = await apiClient.put<{ config: LenderConfiguration }>(
      `/api/v1/admin/lenders/${lenderId}/config`,
      payload,
    );
    return res.data.config;
  },

  async listAuditLogs(
    params: { entityType?: string; entityId?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ items: AuditLogEntry[]; meta: PaginationMeta }> {
    const search = new URLSearchParams();
    if (params.entityType) search.set('entityType', params.entityType);
    if (params.entityId) search.set('entityId', params.entityId);
    const qs = search.toString();
    const res = await apiClient.get<AuditLogEntry[]>(
      `/api/v1/admin/audit-logs${qs ? `?${qs}` : ''}`,
      { signal },
    );
    return {
      items: res.data,
      meta: res.meta ?? { total: res.data.length },
    };
  },

  async resolveManualReview(
    applicationId: string,
    payload: { decision: 'LENDER_PROCESSING' | 'DECLINED' | 'CANCELLED'; reason: string },
  ): Promise<FinancingApplication> {
    const res = await apiClient.post<{ application: FinancingApplication }>(
      `/api/v1/admin/applications/${applicationId}/manual-review`,
      payload,
    );
    return res.data.application;
  },
};

