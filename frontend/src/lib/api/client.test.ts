import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api/client';
import type { ApiClientError } from '@/lib/api/error';
import { useAuthStore } from '@/stores/authStore';

describe('Central API client & 401 refresh flow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('attaches Bearer token, X-Request-Id, and Idempotency-Key headers', async () => {
    useAuthStore.getState().setSession(
      { id: 'u1', email: 'm@example.com', role: 'MERCHANT_OWNER', merchantId: 'm1' },
      { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 },
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-srv-1' },
      }),
    );
    globalThis.fetch = fetchMock;

    const result = await apiClient.post<{ ok: boolean }>(
      '/api/v1/purchases',
      { amountPaise: '1000' },
      { idempotencyKey: 'idem-123456' },
    );

    expect(result.data).toEqual({ ok: true });
    expect(result.requestId).toBe('req-srv-1');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const hdrs = init.headers as Record<string, string>;
    expect(hdrs.Authorization).toBe('Bearer access-1');
    expect(hdrs['Idempotency-Key']).toBe('idem-123456');
    expect(hdrs['X-Request-Id']).toBeTruthy();
  });

  it('refreshes access token once on 401 and replays the failed request', async () => {
    useAuthStore.getState().setSession(
      { id: 'u1', email: 'm@example.com', role: 'MERCHANT_OWNER', merchantId: 'm1' },
      { accessToken: 'expired-access', refreshToken: 'refresh-old', expiresIn: 900 },
    );

    const fetchMock = vi
      .fn()
      // 1st attempt -> 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Expired', requestId: 'req-1' },
          }),
          { status: 401 },
        ),
      )
      // refresh endpoint -> new tokens
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              tokens: { accessToken: 'fresh-access', refreshToken: 'refresh-new', expiresIn: 900 },
            },
          }),
          { status: 200 },
        ),
      )
      // replay attempt -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { shops: [] } }), { status: 200 }),
      );

    globalThis.fetch = fetchMock;

    const res = await apiClient.get<{ shops: unknown[] }>('/api/v1/merchants/shops');
    expect(res.data).toEqual({ shops: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().accessToken).toBe('fresh-access');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-new');
  });

  it('parses structured backend errors including requestId and 423 lockout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account locked due to too many failed attempts',
            requestId: 'req-lock-42',
          },
        }),
        { status: 423 },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(
      apiClient.post('/api/v1/auth/login', { email: 'a@b.com', password: 'bad' }, { skipAuth: true }),
    ).rejects.toMatchObject({
      status: 423,
      code: 'ACCOUNT_LOCKED',
      requestId: 'req-lock-42',
    } satisfies Partial<ApiClientError>);
  });
});
