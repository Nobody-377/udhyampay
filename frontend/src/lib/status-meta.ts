import type {
  ApplicationStatus,
  CheckoutSessionStatus,
  MerchantStatus,
  OfferStatus,
} from '@/types/api';

export type StatusTone = 'neutral' | 'lime' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusMeta {
  label: string;
  description: string;
  tone: StatusTone;
  isTerminal?: boolean;
  isAsyncPending?: boolean;
}

export const APPLICATION_STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    description: 'Application record created and awaiting customer setup.',
    tone: 'neutral',
  },
  CUSTOMER_CONSENT_PENDING: {
    label: 'Consent Recorded / Ready to Submit',
    description: 'Ready for lender underwriting submission once DPDP consent is active.',
    tone: 'warning',
  },
  SUBMITTED: {
    label: 'Submitted',
    description: 'Application accepted and queued for lender waterfall orchestration.',
    tone: 'info',
    isAsyncPending: true,
  },
  LENDER_PROCESSING: {
    label: 'Lender Processing',
    description: 'Underwriting evaluation is in progress with partner lending gateways.',
    tone: 'info',
    isAsyncPending: true,
  },
  OFFER_AVAILABLE: {
    label: 'Offers Available',
    description: 'Eligible financing offer(s) returned. Review and select an offer.',
    tone: 'lime',
  },
  ADDITIONAL_INFORMATION_REQUIRED: {
    label: 'Additional Info Required',
    description:
      'Lender requested supporting information (e.g. bank statements). Submission endpoint awaiting backend integration.',
    tone: 'warning',
  },
  DECLINED: {
    label: 'Declined',
    description: 'Application did not meet participating lender eligibility or credit rules.',
    tone: 'danger',
    isTerminal: true,
  },
  CUSTOMER_ACCEPTED_OFFER: {
    label: 'Offer Accepted',
    description: 'Selected offer confirmed. Awaiting final lender authorization & disbursement.',
    tone: 'lime',
    isAsyncPending: true,
  },
  LENDER_FINAL_CONFIRMATION: {
    label: 'Lender Final Confirmation',
    description: 'Final sanction verification in progress prior to disbursement.',
    tone: 'info',
    isAsyncPending: true,
  },
  DISBURSEMENT_PENDING: {
    label: 'Disbursement Pending',
    description: 'Sanction approved; settlement transfer confirmation is awaited.',
    tone: 'warning',
    isAsyncPending: true,
  },
  DISBURSED: {
    label: 'Disbursed',
    description: 'Loan disbursement confirmed and commission ledger accrued.',
    tone: 'success',
    isTerminal: true,
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'Application cancelled before completion.',
    tone: 'neutral',
    isTerminal: true,
  },
  EXPIRED: {
    label: 'Expired',
    description: 'Application validity window elapsed.',
    tone: 'neutral',
    isTerminal: true,
  },
  TECHNICAL_FAILURE: {
    label: 'Technical Failure',
    description: 'Lender gateway timeout or upstream error prevented completion.',
    tone: 'danger',
  },
  MANUAL_REVIEW: {
    label: 'Manual Review',
    description: 'Escalated to operations admin for review and resolution.',
    tone: 'warning',
    isAsyncPending: true,
  },
};

export const MERCHANT_STATUS_META: Record<MerchantStatus, StatusMeta> = {
  PENDING_VERIFICATION: {
    label: 'Pending Verification',
    description: 'Merchant onboarding awaits administrator verification.',
    tone: 'warning',
  },
  VERIFIED: {
    label: 'Verified',
    description: 'Merchant account is verified and active.',
    tone: 'success',
  },
  SUSPENDED: {
    label: 'Suspended',
    description: 'Merchant operations have been suspended by administrator.',
    tone: 'danger',
  },
};

export const CHECKOUT_STATUS_META: Record<CheckoutSessionStatus, StatusMeta> = {
  ACTIVE: {
    label: 'Active QR Session',
    description: 'QR checkout session is open and valid for inspection.',
    tone: 'lime',
  },
  CONSUMED: {
    label: 'Consumed',
    description: 'Checkout session has already been used.',
    tone: 'success',
  },
  EXPIRED: {
    label: 'Expired',
    description: 'Checkout QR session has expired.',
    tone: 'warning',
  },
  REVOKED: {
    label: 'Revoked',
    description: 'Checkout session was revoked by merchant or system.',
    tone: 'danger',
  },
};

export const OFFER_STATUS_META: Record<OfferStatus, StatusMeta> = {
  ACTIVE: { label: 'Active', description: 'Available for selection', tone: 'lime' },
  ACCEPTED: { label: 'Accepted', description: 'Accepted by customer', tone: 'success' },
  EXPIRED: { label: 'Expired', description: 'Offer expired', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', description: 'Withdrawn by lender', tone: 'danger' },
  SUPERSEDED: { label: 'Superseded', description: 'Replaced by selected offer', tone: 'neutral' },
};

export function canMerchantCancelApplication(status: ApplicationStatus): boolean {
  return !['DECLINED', 'DISBURSED', 'CANCELLED', 'EXPIRED', 'LENDER_FINAL_CONFIRMATION', 'DISBURSEMENT_PENDING'].includes(
    status,
  );
}

