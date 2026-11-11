import { ConflictError } from '../../common/errors';
import type { FinancingApplicationEntity, PurchaseEntity } from './stores';

export type PurchasePayloadForIdempotency = Pick<
  PurchaseEntity,
  'shopId' | 'customerId' | 'productCategory' | 'productDescription' | 'amountPaise' | 'currency' | 'idempotencyKey'
>;

export type ApplicationPayloadForIdempotency = Pick<
  FinancingApplicationEntity,
  | 'shopId'
  | 'purchaseId'
  | 'customerId'
  | 'requestedAmountPaise'
  | 'downPaymentPaise'
  | 'requestedTenureMonths'
  | 'routingMode'
  | 'idempotencyKey'
>;

/**
 * Verifies an idempotent purchase replay matches the original persisted purchase
 * payload; rejects payload drift on the same key with ConflictError.
 */
export function assertPurchaseIdempotentMatch(
  existing: PurchaseEntity,
  incoming: PurchasePayloadForIdempotency,
): void {
  const mismatch =
    existing.shopId !== incoming.shopId ||
    (existing.customerId ?? null) !== (incoming.customerId ?? null) ||
    existing.productCategory !== incoming.productCategory ||
    (existing.productDescription ?? null) !== (incoming.productDescription ?? null) ||
    existing.amountPaise !== incoming.amountPaise ||
    existing.currency !== incoming.currency;

  if (mismatch) {
    throw new ConflictError(
      `Idempotency key '${incoming.idempotencyKey}' was already used with a different purchase payload`,
    );
  }
}

/**
 * Verifies an idempotent application replay matches the original persisted
 * application payload; rejects payload drift on the same key with ConflictError.
 */
export function assertApplicationIdempotentMatch(
  existing: FinancingApplicationEntity,
  incoming: ApplicationPayloadForIdempotency,
): void {
  const mismatch =
    existing.shopId !== incoming.shopId ||
    existing.purchaseId !== incoming.purchaseId ||
    existing.customerId !== incoming.customerId ||
    existing.requestedAmountPaise !== incoming.requestedAmountPaise ||
    existing.downPaymentPaise !== incoming.downPaymentPaise ||
    (existing.requestedTenureMonths ?? null) !== (incoming.requestedTenureMonths ?? null) ||
    existing.routingMode !== incoming.routingMode;

  if (mismatch) {
    throw new ConflictError(
      `Idempotency key '${incoming.idempotencyKey}' was already used with a different application payload`,
    );
  }
}

