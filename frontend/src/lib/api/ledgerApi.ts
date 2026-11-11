import { apiClient } from '@/lib/api/client';
import type { CommissionLedgerSummary } from '@/types/api';

export const ledgerApi = {
  async getCommissionSummary(
    params: { merchantId?: string; skip?: number; take?: number } = {},
    signal?: AbortSignal,
  ): Promise<CommissionLedgerSummary> {
    const search = new URLSearchParams();
    if (params.merchantId) search.set('merchantId', params.merchantId);
    if (params.skip !== undefined) search.set('skip', String(params.skip));
    if (params.take !== undefined) search.set('take', String(params.take));
    const qs = search.toString();
    const res = await apiClient.get<{ summary: CommissionLedgerSummary }>(
      `/api/v1/ledger/commission${qs ? `?${qs}` : ''}`,
      { signal },
    );
    return res.data.summary;
  },
};

