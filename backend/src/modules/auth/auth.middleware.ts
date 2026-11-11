import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/errors';
import type { ActorType, AppStores, MerchantStatus, UserRole } from '../persistence/stores';
import type { JwtPayload, TokenService } from './token';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  merchantId: string | null;
  tokenVersion: number;
}

const uuidSchema = z.string().uuid();

export const PLATFORM_ADMIN_ROLES: readonly UserRole[] = [
  'ADMIN',
  'SYSTEM_ADMIN',
  'OPS_AGENT',
];

export const MERCHANT_ROLES: readonly UserRole[] = [
  'MERCHANT_OWNER',
  'MERCHANT_STAFF',
];

export function isPlatformAdminRole(role?: UserRole): boolean {
  return role === 'ADMIN' || role === 'SYSTEM_ADMIN' || role === 'OPS_AGENT';
}

export function isMerchantRole(role?: UserRole): boolean {
  return role === 'MERCHANT_OWNER' || role === 'MERCHANT_STAFF';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function createAuthMiddleware(tokenService: TokenService, stores: AppStores): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or malformed Authorization header'));
      return;
    }

    const token = authHeader.substring(7).trim();
    let payload: JwtPayload;
    try {
      payload = tokenService.verifyAccessToken(token);
    } catch (err) {
      next(err);
      return;
    }

    if (typeof payload.sub !== 'string' || !uuidSchema.safeParse(payload.sub).success) {
      next(new UnauthorizedError('Invalid token payload'));
      return;
    }

    // Verify token version in store to support instant revocation
    const user = await stores.users.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      next(new UnauthorizedError('User account not found or suspended'));
      return;
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      next(new UnauthorizedError('Token has been revoked'));
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      merchantId: user.merchantId,
      tokenVersion: user.tokenVersion,
    };

    next();
  };
}

export function assertNoMerchantTampering(req: Request, authenticatedMerchantId: string): void {
  const queryMerchantId = req.query.merchantId;
  if (queryMerchantId !== undefined && queryMerchantId !== authenticatedMerchantId) {
    throw new ForbiddenError('Access denied: merchant mismatch');
  }

  const body = req.body;
  if (
    body !== null &&
    body !== undefined &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'merchantId' in body
  ) {
    const bodyMerchantId = (body as Record<string, unknown>).merchantId;
    if (bodyMerchantId !== undefined && bodyMerchantId !== authenticatedMerchantId) {
      throw new ForbiddenError('Access denied: merchant mismatch');
    }
  }
}

export async function requireAuthenticatedMerchantId(
  req: Request,
  stores?: AppStores,
  options?: { allowMissingEntityForSelfLookup?: boolean },
): Promise<string> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  if (!isMerchantRole(req.user.role)) {
    throw new ForbiddenError('Merchant role required');
  }

  const merchantId = req.user.merchantId;
  if (!merchantId) {
    throw new ForbiddenError('Merchant association required');
  }
  if (!uuidSchema.safeParse(merchantId).success) {
    throw new ForbiddenError('Invalid merchant association');
  }

  assertNoMerchantTampering(req, merchantId);

  if (stores && !options?.allowMissingEntityForSelfLookup) {
    const merchant = await stores.merchants.findById(merchantId);
    if (!merchant) {
      throw new ForbiddenError('Merchant account association is invalid');
    }
  }

  return merchantId;
}

export async function resolveMerchantOrAdminScope(
  req: Request,
  stores?: AppStores,
): Promise<{ actor: ActorType; merchantId: string | undefined }> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  if (isPlatformAdminRole(req.user.role)) {
    return { actor: 'ADMIN_USER', merchantId: undefined };
  }

  if (isMerchantRole(req.user.role)) {
    const merchantId = await requireAuthenticatedMerchantId(req, stores);
    return { actor: 'MERCHANT_USER', merchantId };
  }

  throw new ForbiddenError('Merchant or Admin role required');
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success;
}

export function requireMerchantEntityExistsOrNotFound(
  merchant: Awaited<ReturnType<AppStores['merchants']['findById']>>,
): NonNullable<typeof merchant> {
  if (!merchant) {
    throw new NotFoundError('Merchant not found');
  }
  return merchant;
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`Action requires role: ${roles.join(' or ')}`));
      return;
    }
    next();
  };
}

export function requireMerchantStatus(stores: AppStores, ...statuses: MerchantStatus[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }
      if (isPlatformAdminRole(req.user.role)) {
        next();
        return;
      }
      if (!isMerchantRole(req.user.role)) {
        next(new ForbiddenError('Merchant role required'));
        return;
      }
      if (!req.user.merchantId) {
        next(new ForbiddenError('Merchant account association required'));
        return;
      }
      if (!isValidUuid(req.user.merchantId)) {
        next(new ForbiddenError('Invalid merchant association'));
        return;
      }

      const merchant = await stores.merchants.findById(req.user.merchantId);
      if (!merchant) {
        next(new ForbiddenError('Merchant not found'));
        return;
      }

      if (!statuses.includes(merchant.status)) {
        next(
          new ForbiddenError(
            `Merchant is ${merchant.status}; required: ${statuses.join(' or ')}`,
          ),
        );
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
