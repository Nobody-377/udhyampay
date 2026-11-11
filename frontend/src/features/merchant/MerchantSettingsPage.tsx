import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { KpiGridSkeleton } from '@/components/ui/Skeleton';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MerchantStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { merchantApi } from '@/lib/api/merchantApi';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export function MerchantSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const merchantQuery = useQuery({
    queryKey: ['merchant', 'me'],
    queryFn: ({ signal }) => merchantApi.getMe(signal),
  });

  const merchant = merchantQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Merchant Profile &amp; Settings
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Authenticated merchant account &amp; role details.
          </p>
        </div>

        {merchantQuery.error ? (
          <ErrorState error={merchantQuery.error} onRetry={() => merchantQuery.refetch()} />
        ) : null}

        {merchantQuery.isLoading ? (
          <KpiGridSkeleton count={2} />
        ) : merchant ? (
          <Card className="p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-[rgba(200,255,50,0.12)] text-[#C8FF32] flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">{merchant.legalName}</h2>
                  <p className="text-xs text-[#9CA3AF]">
                    Trade Name: {merchant.tradeName || 'Not specified'}
                  </p>
                </div>
              </div>
              <MerchantStatusBadge status={merchant.status} />
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-4 border-t border-[rgba(255,255,255,0.08)]">
              <div>
                <dt className="text-[#6B7280]">Merchant ID</dt>
                <dd className="font-mono text-[#F8FAFC] mt-1 break-all">{merchant.id}</dd>
              </div>
              <div>
                <dt className="text-[#6B7280]">Signed-In Operator</dt>
                <dd className="font-mono text-[#F8FAFC] mt-1">
                  {user?.email} ({user?.role})
                </dd>
              </div>
              <div>
                <dt className="text-[#6B7280]">Verified At</dt>
                <dd className="text-[#F8FAFC] mt-1">{formatDateTime(merchant.verifiedAt)}</dd>
              </div>
              <div>
                <dt className="text-[#6B7280]">Onboarded At</dt>
                <dd className="text-[#F8FAFC] mt-1">{formatDateTime(merchant.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        ) : null}

        <BackendRequiredNotice
          title="Staff Management & Customer DPDP Directory Pending Backend APIs"
          description="Adding MERCHANT_STAFF users, searching customers, and revoking checkout sessions require dedicated backend endpoints before operational UI controls can execute."
          requiredEndpoints={[
            'GET /api/v1/merchants/staff',
            'POST /api/v1/merchants/staff',
            'PATCH /api/v1/merchants/staff/:userId',
            'GET /api/v1/customers',
            'POST /api/v1/customers/:id/anonymize',
          ]}
        />
      </div>
    </DashboardLayout>
  );
}

