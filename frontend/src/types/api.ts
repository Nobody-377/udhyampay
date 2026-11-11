export type UserRole =
  | 'ADMIN'
  | 'SYSTEM_ADMIN'
  | 'OPS_AGENT'
  | 'MERCHANT_OWNER'
  | 'MERCHANT_STAFF';

export type MerchantStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'SUSPENDED';
export type ShopStatus = 'ACTIVE' | 'INACTIVE';

export type ProductCategory =
  | 'SMARTPHONE'
  | 'TELEVISION'
  | 'REFRIGERATOR'
  | 'WASHING_MACHINE'
  | 'AIR_CONDITIONER'
  | 'LAPTOP'
  | 'OTHER_ELECTRONICS';

export const PRODUCT_CATEGORIES: readonly { value: ProductCategory; label: string }[] = [
  { value: 'SMARTPHONE', label: 'Smartphone' },
  { value: 'TELEVISION', label: 'Television' },
  { value: 'REFRIGERATOR', label: 'Refrigerator' },
  { value: 'WASHING_MACHINE', label: 'Washing Machine' },
  { value: 'AIR_CONDITIONER', label: 'Air Conditioner' },
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'OTHER_ELECTRONICS', label: 'Other Electronics' },
] as const;

export type ConsentPurpose = 'FINANCING_APPLICATION_PROCESSING' | 'LENDER_DATA_SHARING';
export type ConsentCaptureMethod = 'CUSTOMER_CHECKOUT_SESSION' | 'MERCHANT_ASSISTED';
export type CheckoutSessionStatus = 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
export type RoutingMode = 'SEQUENTIAL' | 'DISCOVERY';

export type ApplicationStatus =
  | 'DRAFT'
  | 'CUSTOMER_CONSENT_PENDING'
  | 'SUBMITTED'
  | 'LENDER_PROCESSING'
  | 'OFFER_AVAILABLE'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'DECLINED'
  | 'CUSTOMER_ACCEPTED_OFFER'
  | 'LENDER_FINAL_CONFIRMATION'
  | 'DISBURSEMENT_PENDING'
  | 'DISBURSED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'TECHNICAL_FAILURE'
  | 'MANUAL_REVIEW';

export type ActorType = 'MERCHANT_USER' | 'ADMIN_USER' | 'SYSTEM' | 'LENDER';
export type OfferType = 'INDICATIVE_ELIGIBILITY' | 'FIRM_OFFER';
export type OfferStatus = 'ACTIVE' | 'ACCEPTED' | 'EXPIRED' | 'WITHDRAWN' | 'SUPERSEDED';
export type RateType = 'FIXED' | 'FLOATING' | 'FLAT' | 'REDUCING_BALANCE' | 'UNSPECIFIED';
export type CommissionEntryType = 'ACCRUAL' | 'REVERSAL' | 'ADJUSTMENT';

export interface PaginationMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  merchantId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Merchant {
  id: string;
  legalName: string;
  tradeName: string | null;
  status: MerchantStatus;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Shop {
  id: string;
  merchantId: string;
  name: string;
  city: string;
  state: string;
  status: ShopStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  merchantId: string;
  fullName: string;
  phone: string;
  retentionExpiresAt: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerConsent {
  id: string;
  merchantId: string;
  customerId: string;
  purpose: ConsentPurpose;
  noticeVersion: string;
  captureMethod: ConsentCaptureMethod;
  grantedAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface Purchase {
  id: string;
  merchantId: string;
  shopId: string;
  customerId: string | null;
  productCategory: ProductCategory;
  productDescription: string | null;
  amountPaise: string;
  currency: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutSessionCreateResponse {
  sessionId: string;
  status: CheckoutSessionStatus;
  expiresAt: string;
  qrPayload: string;
  rawToken: string;
  purchase: Purchase;
}

export interface CheckoutSessionPublicView {
  sessionId: string;
  status: CheckoutSessionStatus;
  expiresAt: string;
  purchase: {
    id: string;
    productCategory: ProductCategory;
    productDescription: string | null;
    amountPaise: string;
    currency: string;
  };
}

export interface FinancingApplication {
  id: string;
  merchantId: string;
  shopId: string;
  purchaseId: string;
  customerId: string;
  createdByUserId: string | null;
  status: ApplicationStatus;
  routingMode: RoutingMode;
  requestedAmountPaise: string;
  downPaymentPaise: string;
  requestedTenureMonths: number | null;
  idempotencyKey: string;
  version: number;
  submittedAt: string | null;
  expiresAt: string | null;
  terminalAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingOffer {
  id: string;
  applicationId: string;
  lenderApplicationId: string;
  merchantId: string;
  lenderId: string;
  offerType: OfferType;
  status: OfferStatus;
  lenderOfferReference: string;
  principalPaise: string;
  downPaymentPaise: string | null;
  tenureMonths: number;
  interestRatePercent: string | null;
  rateType: RateType;
  aprPercent: string | null;
  emiPaise: string;
  processingFeePaise: string | null;
  taxesPaise: string | null;
  otherChargesPaise: string | null;
  totalRepayablePaise: string | null;
  repaymentSchedule: unknown | null;
  termsVersion: string | null;
  termsUrl: string | null;
  expiresAt: string | null;
  isSimulated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDetailsResponse {
  application: FinancingApplication;
  offers: FinancingOffer[];
  purchase: {
    id: string;
    productCategory: ProductCategory | string;
    productDescription: string | null;
    amountPaise: string;
  };
  customer: {
    id: string;
    fullName: string;
    phone: string;
  };
}

export interface ApplicationStatusHistoryEntry {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  actorType: ActorType;
  actorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CommissionEntry {
  id: string;
  merchantId: string;
  applicationId: string;
  transactionId: string;
  entryType: CommissionEntryType;
  amountPaise: string;
  ruleCode: string;
  ruleSnapshot: Record<string, unknown>;
  reversesEntryId: string | null;
  note: string | null;
  createdAt: string;
}

export interface CommissionLedgerSummary {
  totalAccruedPaise: string;
  totalReversedPaise: string;
  netCommissionPaise: string;
  entries: CommissionEntry[];
}

export interface LenderConfiguration {
  id: string;
  lenderId: string;
  enabled: boolean;
  priority: number;
  minAmountPaise: string | null;
  maxAmountPaise: string | null;
  supportedCategories: ProductCategory[];
  supportsDiscovery: boolean;
  fallbackOnDecline: boolean;
  requestTimeoutMs: number;
  maxSafeRetries: number;
  routingRules: unknown | null;
  secretRef: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorType: ActorType;
  actorUserId: string | null;
  merchantId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

