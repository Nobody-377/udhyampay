import { apiClient } from '@/lib/api/client';
import type { AuthTokens, AuthUser, UserRole } from '@/types/api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RegisterPayload {
  email: string;
  password: string;
  legalName: string;
  tradeName?: string;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  role: UserRole;
  merchantId: string;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse>('/api/v1/auth/login', payload, {
      skipAuth: true,
    });
    return res.data;
  },

  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const res = await apiClient.post<RegisterResponse>('/api/v1/auth/register', payload, {
      skipAuth: true,
    });
    return res.data;
  },

  async refresh(refreshToken: string): Promise<{ tokens: AuthTokens }> {
    const res = await apiClient.post<{ tokens: AuthTokens }>(
      '/api/v1/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
    return res.data;
  },

  async logout(refreshToken?: string | null): Promise<void> {
    await apiClient.post<{ message: string }>(
      '/api/v1/auth/logout',
      refreshToken ? { refreshToken } : {},
      { skipAuth: true },
    );
  },

  /**
   * BACKEND CHANGE REQUIRED:
   * `GET /api/v1/auth/me` is currently mounted before `authMiddleware` in
   * `src/routes/index.ts:46`, returning `{ user: undefined }`.
   */
  async getMe(): Promise<{ user?: AuthUser }> {
    const res = await apiClient.get<{ user?: AuthUser }>('/api/v1/auth/me');
    return res.data;
  },
};

