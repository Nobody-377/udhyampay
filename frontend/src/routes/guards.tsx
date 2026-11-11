import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { getDefaultHomeForRole, useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/api';

function SessionLoadingScreen() {
  return (
    <div className="min-h-screen bg-[#090A0C] flex items-center justify-center p-6">
      <Card className="p-8 max-w-sm w-full text-center space-y-3">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#C8FF32] border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-[#F8FAFC]">Restoring secure session…</p>
        <p className="text-xs text-[#9CA3AF]">Validating active token with Udyam PAY API.</p>
      </Card>
    </div>
  );
}

export interface ProtectedRouteProps {
  allowedRoles: readonly UserRole[];
  children: ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isHydrating = useAuthStore((s) => s.isHydrating);

  if (isHydrating) {
    return <SessionLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getDefaultHomeForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isHydrating = useAuthStore((s) => s.isHydrating);

  if (isHydrating) {
    return <SessionLoadingScreen />;
  }

  if (user) {
    return <Navigate to={getDefaultHomeForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

