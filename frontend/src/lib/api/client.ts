import { envConfig } from '@/lib/config';
import { ApiClientError } from '@/lib/api/error';
import type { ApiErrorEnvelope, ApiSuccessEnvelope, AuthTokens, PaginationMeta } from '@/types/api';

/**
 * Auth session bridge registered by `authStore` to keep token storage decoupled
 * from the HTTP transport without circular imports.
 */
interface TokenBridge {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: AuthTokens) => void;
  onSessionExpired: () => void;
}

let tokenBridge: TokenBridge | null = null;
let refreshInFlight: Promise<AuthTokens> | null = null;

export function registerTokenBridge(bridge: TokenBridge): void {
  tokenBridge = bridge;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  skipAuth?: boolean;
  _isRetryAfterRefresh?: boolean;
}

export interface ApiResponseResult<T> {
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web_${crypto.randomUUID()}`;
  }
  return `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function performTokenRefresh(): Promise<AuthTokens> {
  if (!tokenBridge) {
    throw new ApiClientError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication session is not initialized',
    });
  }

  const refreshToken = tokenBridge.getRefreshToken();
  if (!refreshToken) {
    tokenBridge.onSessionExpired();
    throw new ApiClientError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Session expired. Please log in again.',
    });
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await requestRaw<{ tokens: AuthTokens }>('/api/v1/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
          skipAuth: true,
        });
        tokenBridge?.onTokensRefreshed(res.data.tokens);
        return res.data.tokens;
      } catch (err) {
        tokenBridge?.onSessionExpired();
        throw err;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function requestRaw<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponseResult<T>> {
  const { body, headers = {}, idempotencyKey, skipAuth = false, _isRetryAfterRefresh = false, ...rest } =
    options;

  const clientRequestId = generateRequestId();
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': clientRequestId,
    ...headers,
  };

  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (idempotencyKey) {
    finalHeaders['Idempotency-Key'] = idempotencyKey;
  }

  if (!skipAuth && tokenBridge) {
    const token = tokenBridge.getAccessToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${envConfig.apiBaseUrl}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the Udyam PAY API server. Verify it is running and CORS is enabled.',
      requestId: clientRequestId,
    });
  }

  const serverRequestId = response.headers.get('X-Request-Id') || clientRequestId;

  if (response.status === 401 && !skipAuth && !_isRetryAfterRefresh && tokenBridge?.getRefreshToken()) {
    await performTokenRefresh();
    return requestRaw<T>(path, {
      ...options,
      _isRetryAfterRefresh: true,
    });
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiClientError({
        status: response.status,
        code: response.ok ? 'INVALID_RESPONSE' : 'INTERNAL_ERROR',
        message: 'Server returned a malformed JSON response.',
        requestId: serverRequestId,
      });
    }
  }

  if (!response.ok) {
    const errBody = parsed as Partial<ApiErrorEnvelope> | null;
    if (errBody && errBody.success === false && errBody.error) {
      throw new ApiClientError({
        status: response.status,
        code: errBody.error.code || 'INTERNAL_ERROR',
        message: errBody.error.message || `Request failed with status ${response.status}`,
        details: errBody.error.details,
        requestId: errBody.error.requestId || serverRequestId,
      });
    }

    throw new ApiClientError({
      status: response.status,
      code: response.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
      message: `HTTP ${response.status} error`,
      requestId: serverRequestId,
    });
  }

  // Handle plain health/readiness endpoints without `{ success: true, data }` envelope
  const envelope = parsed as Partial<ApiSuccessEnvelope<T>> | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope && envelope.success === true) {
    return {
      data: envelope.data as T,
      meta: envelope.meta,
      requestId: serverRequestId,
    };
  }

  return {
    data: parsed as T,
    requestId: serverRequestId,
  };
}

export const apiClient = {
  request: requestRaw,
  get: <T>(path: string, options?: ApiRequestOptions) =>
    requestRaw<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    requestRaw<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    requestRaw<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    requestRaw<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    requestRaw<T>(path, { ...options, method: 'DELETE' }),
};

