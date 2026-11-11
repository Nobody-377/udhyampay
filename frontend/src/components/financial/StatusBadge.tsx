import { Badge } from '@/components/ui/Badge';
import {
  APPLICATION_STATUS_META,
  CHECKOUT_STATUS_META,
  MERCHANT_STATUS_META,
  OFFER_STATUS_META,
} from '@/lib/status-meta';
import type {
  ApplicationStatus,
  CheckoutSessionStatus,
  MerchantStatus,
  OfferStatus,
} from '@/types/api';

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const meta = APPLICATION_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function MerchantStatusBadge({ status }: { status: MerchantStatus }) {
  const meta = MERCHANT_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function CheckoutStatusBadge({ status }: { status: CheckoutSessionStatus }) {
  const meta = CHECKOUT_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const meta = OFFER_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

