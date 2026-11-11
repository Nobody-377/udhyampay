import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/authApi';
import { useAuthStore } from '@/stores/authStore';

export function useSessionBootstrap(): void {
  const ranRef = useRef(false);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateTokens = useAuthStore((s) => s.updateTokens);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setHydrating = useAuthStore((s) => s.setHydrating);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!refreshToken || accessToken) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.refresh(refreshToken);
        if (!cancelled) {
          updateTokens(res.tokens);
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, refreshToken, setHydrating, updateTokens]);
}

export function useLogout() {
  const queryClient = useQueryClient();
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);

  return async () => {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // Clear local session regardless of network failure
    } finally {
      clearSession();
      queryClient.clear();
    }
  };
}

