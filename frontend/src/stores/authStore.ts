import { create } from 'zustand';
import { registerTokenBridge } from '@/lib/api/client';
import type { AuthTokens, AuthUser, UserRole } from '@/types/api';

/**
 * Auth persistence strategy aligned with existing backend CORS (`credentials: false`).
 *
 * SECURITY NOTES:
 * 1. `accessToken` lives ONLY in JavaScript memory (never written to localStorage/sessionStorage).
 * 2. Refresh token & non-sensitive user metadata (`id`, `email`, `role`, `merchantId`) are
 *    held in `sessionStorage` so tab reloads can rotate the access token via `/api/v1/auth/refresh`.
 * 3. NEVER store passwords, PAN, Aadhaar, KYC documents, or bank details in browser storage.
 *
 * BACKEND CHANGE REQUIRED for strict XSS-proof refresh persistence:
 *   - Issue refresh token as an `HttpOnly; Secure; SameSite=Strict` cookie and set
 *     `credentials: true` in `src/app.ts` CORS configuration.
 *   - Attach `authMiddleware` to `GET /api/v1/auth/me` (currently mounted before `authMiddleware`
 *     in `src/routes/index.ts:46`) and return `{ user: { id, email, role, merchantId } }`.
 */
const SESSION_STORAGE_KEY = 'udyam_pay_session_v1';

interface StoredSessionSnapshot {
  refreshToken: string;
  user: AuthUser;
}

function readStoredSession(): StoredSessionSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSessionSnapshot>;
    if (!parsed?.refreshToken || !parsed?.user?.id || !parsed?.user?.role) {
      return null;
    }
    return parsed as StoredSessionSnapshot;
  } catch {
    return null;
  }
}

function writeStoredSession(snapshot: StoredSessionSnapshot | null): void {
  try {
    if (!snapshot) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota or restricted-context failures silently
  }
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrating: boolean;
  setSession: (user: AuthUser, tokens: AuthTokens) => void;
  updateTokens: (tokens: AuthTokens) => void;
  clearSession: () => void;
  setHydrating: (hydrating: boolean) => void;
}

const initialSnapshot = typeof window !== 'undefined' ? readStoredSession() : null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialSnapshot?.user ?? null,
  accessToken: null,
  refreshToken: initialSnapshot?.refreshToken ?? null,
  isHydrating: Boolean(initialSnapshot?.refreshToken),

  setSession: (user, tokens) => {
    writeStoredSession({ refreshToken: tokens.refreshToken, user });
    set({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isHydrating: false,
    });
  },

  updateTokens: (tokens) => {
    const currentUser = get().user;
    if (currentUser) {
      writeStoredSession({ refreshToken: tokens.refreshToken, user: currentUser });
    }
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isHydrating: false,
    });
  },

  clearSession: () => {
    writeStoredSession(null);
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrating: false,
    });
  },

  setHydrating: (isHydrating) => set({ isHydrating }),
}));

registerTokenBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (tokens) => useAuthStore.getState().updateTokens(tokens),
  onSessionExpired: () => useAuthStore.getState().clearSession(),
});

export function isAdminRole(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'SYSTEM_ADMIN' || role === 'OPS_AGENT';
}

export function isMerchantRole(role?: UserRole | null): boolean {
  return role === 'MERCHANT_OWNER' || role === 'MERCHANT_STAFF';
}

export function getDefaultHomeForRole(role: UserRole): string {
  return isAdminRole(role) ? '/admin' : '/merchant';
}

