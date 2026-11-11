import { useQuery } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { healthApi } from '@/lib/api/healthApi';
import { envConfig } from '@/lib/config';
import { useAuthStore } from '@/stores/authStore';

export function AdminSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: ({ signal }) => healthApi.getHealth(signal),
  });
  const readyQuery = useQuery({
    queryKey: ['system', 'ready'],
    queryFn: ({ signal }) => healthApi.getReadiness(signal),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            System Settings &amp; Backend Contract Notes
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Environment diagnostics and documented backend changes needed before expanding operations.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-[#C8FF32]" />
            <h2 className="text-base font-bold text-[#F8FAFC]">Runtime Environment</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-[#6B7280]">Configured API Base URL</dt>
              <dd className="font-mono text-[#F8FAFC] mt-1">{envConfig.apiBaseUrl}</dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Signed-In Operator</dt>
              <dd className="font-mono text-[#F8FAFC] mt-1">
                {user?.email} ({user?.role})
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">API Liveness</dt>
              <dd className="mt-1">
                <Badge variant={healthQuery.data?.status === 'ok' ? 'success' : 'warning'}>
                  {healthQuery.data?.status ?? 'Checking'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Database Readiness</dt>
              <dd className="mt-1">
                <Badge variant={readyQuery.data?.status === 'ready' ? 'success' : 'danger'}>
                  {readyQuery.data?.status ?? 'Checking'}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <BackendRequiredNotice
          title="Backend Fixes & Expansion Contracts Documented Without Code Modification"
          description="Per strict project constraints, the existing backend was left untouched. Highlighted items below document verified defects (such as GET /api/v1/auth/me returning req.user === undefined due to router order in src/routes/index.ts:46) and unexposed endpoints."
          requiredEndpoints={[
            'Fix GET /api/v1/auth/me (apply authMiddleware)',
            'Fix PUT /api/v1/admin/lenders/:id/config (Zod BigInt coercion)',
            'GET /api/v1/admin/users | /merchants | /lenders | /applications',
            'Utility Services (/api/v1/utilities/*)',
            'Customer Auth & Portal (/api/v1/auth/customer/*, /api/v1/customer/*)',
          ]}
        />
      </div>
    </DashboardLayout>
  );
}

