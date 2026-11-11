import type { ApiErrorDetail } from '@/types/api';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly requestId?: string;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
  }
}

const DEFAULT_INTERNAL_ERROR =
  'An unexpected server error occurred. Please retry or share the Request ID.';

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Please review the highlighted input fields and try again.',
  BAD_REQUEST: 'The request could not be processed. Check the submitted parameters.',
  UNAUTHORIZED: 'Your session has expired or is invalid. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested record could not be found.',
  CONFLICT: 'This action conflicts with the current record state.',
  INVALID_STATE_TRANSITION: 'This application state cannot transition as requested.',
  ACCOUNT_LOCKED: 'Too many failed login attempts. Account is temporarily locked for 15 minutes.',
  RATE_LIMITED: 'Too many requests in a short period. Please wait a moment and retry.',
  SERVICE_UNAVAILABLE: 'The service or upstream lender gateway is temporarily unavailable.',
  INTEGRATION_CONFIG_ERROR:
    'Live lender integration credentials are not configured in this environment.',
  INTERNAL_ERROR: DEFAULT_INTERNAL_ERROR,
  NETWORK_ERROR: 'Cannot reach the Udyam PAY backend server. Check your connection or backend status.',
};

export function getFriendlyErrorMessage(error: unknown): {
  title: string;
  message: string;
  requestId?: string;
  code?: string;
  details?: ApiErrorDetail[];
} {
  if (error instanceof ApiClientError) {
    const defaultHint = FRIENDLY_ERROR_MESSAGES[error.code];
    return {
      title:
        error.status === 423
          ? 'Account Locked'
          : error.status === 403
            ? 'Access Restricted'
            : error.status === 503
              ? 'Service Unavailable'
              : 'Request Failed',
      message: error.message || defaultHint || DEFAULT_INTERNAL_ERROR,
      requestId: error.requestId,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      title: 'Unexpected Error',
      message: error.message,
    };
  }

  return {
    title: 'Unexpected Error',
    message: DEFAULT_INTERNAL_ERROR,
  };
}
