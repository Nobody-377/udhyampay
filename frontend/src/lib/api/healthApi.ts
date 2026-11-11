import { apiClient } from '@/lib/api/client';

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'unavailable';
}

export const healthApi = {
  async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const res = await apiClient.get<HealthResponse>('/health', { skipAuth: true, signal });
    return res.data;
  },

  async getReadiness(signal?: AbortSignal): Promise<ReadinessResponse> {
    const res = await apiClient.get<ReadinessResponse>('/ready', { skipAuth: true, signal });
    return res.data;
  },
};

