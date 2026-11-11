import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/FormFields';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { ApplicationStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { adminApi } from '@/lib/api/adminApi';
import { applicationApi } from '@/lib/api/applicationApi';
import { ledgerApi } from '@/lib/api/ledgerApi';
import {
  resolveManualReviewSchema,
  type ResolveManualReviewFormValues,
} from '@/lib/validation/schemas';

export function AdminApplicationsPage() {
  const [searchParams] = useSearchParams();
  const [lookupId, setLookupId] = useState(searchParams.get('applicationId') ?? '');
  const [activeAppId, setActiveAppId] = useState(searchParams.get('applicationId') ?? '');
  const [merchantLedgerId, setMerchantLedgerId] = useState('');
  const [resolvedMsg, setResolvedMsg] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);

  const detailQuery = useQuery({
    queryKey: ['admin', 'application', activeAppId],
    enabled: activeAppId.trim().length > 10,
    queryFn: ({ signal }) => applicationApi.getApplication(activeAppId.trim(), signal),
    retry: false,
  });

  const ledgerQuery = useQuery({
    queryKey: ['admin', 'ledger', merchantLedgerId],
    enabled: merchantLedgerId.trim().length > 10,
    queryFn: ({ signal }) =>
      ledgerApi.getCommissionSummary({ merchantId: merchantLedgerId.trim(), skip: 0, take: 20 }, signal),
    retry: false,
  });

  const reviewForm = useForm<ResolveManualReviewFormValues>({
    resolver: zodResolver(resolveManualReviewSchema),
    defaultValues: {
      applicationId: searchParams.get('applicationId') ?? '',
      decision: 'LENDER_PROCESSING',
      reason: '',
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (values: ResolveManualReviewFormValues) =>
      adminApi.resolveManualReview(values.applicationId, {
        decision: values.decision,
        reason: values.reason,
      }),
    onSuccess: (app) => {
      setResolvedMsg(`Application ${app.id} transitioned to ${app.status}`);
      setActionError(null);
      setActiveAppId(app.id);
      detailQuery.refetch();
    },
    onError: (err) => setActionError(err),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Applications &amp; Manual Review
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Inspect any application by UUID and resolve escalated{' '}
            <code className="font-mono text-xs">MANUAL_REVIEW</code> cases.
          </p>
        </div>

        <BackendRequiredNotice
          title="Cross-Merchant Application & Utility Directory APIs Required"
          description="Listing all applications across merchants requires GET /api/v1/admin/applications. Existing backend permits inspecting individual records via GET /api/v1/applications/:id and resolving manual reviews."
          requiredEndpoints={[
            'GET /api/v1/admin/applications',
            'GET /api/v1/admin/transactions',
            'GET /api/v1/admin/webhooks',
          ]}
        />

        {/* Lookup by UUID */}
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-bold text-[#F8FAFC]">Inspect Application by UUID</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                id="admin-app-lookup"
                label="Application UUID"
                placeholder="Paste FinancingApplication UUID"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setActiveAppId(lookupId);
                  reviewForm.setValue('applicationId', lookupId.trim());
                }}
                leftIcon={<Search className="h-4 w-4" />}
              >
                Lookup
              </Button>
            </div>
          </div>

          {detailQuery.error ? <ErrorState error={detailQuery.error} /> : null}
          {detailQuery.data ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[#6B7280] block">Status</span>
                <div className="mt-1">
                  <ApplicationStatusBadge status={detailQuery.data.application.status} />
                </div>
              </div>
              <div>
                <span className="text-[#6B7280] block">Requested Amount</span>
                <MoneyDisplay
                  paise={detailQuery.data.application.requestedAmountPaise}
                  className="mt-1 block text-base font-bold text-[#C8FF32]"
                />
              </div>
              <div>
                <span className="text-[#6B7280] block">Customer</span>
                <span className="mt-1 block text-sm font-semibold text-[#F8FAFC]">
                  {detailQuery.data.customer.fullName} ({detailQuery.data.customer.phone})
                </span>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Manual Review Resolution */}
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-bold text-[#F8FAFC]">Resolve Manual Review Escalation</h2>
          {actionError ? <ErrorState error={actionError} /> : null}
          {resolvedMsg ? (
            <div className="flex items-center gap-2 rounded-xl bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] p-3 text-xs text-[#34D399]">
              <CheckCircle2 className="h-4 w-4" />
              <span>{resolvedMsg}</span>
            </div>
          ) : null}

          <form
            onSubmit={reviewForm.handleSubmit((values) => reviewMutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="mr-app-id"
                label="Application UUID (Must be in MANUAL_REVIEW)"
                error={reviewForm.formState.errors.applicationId?.message}
                {...reviewForm.register('applicationId')}
              />
              <Select
                id="mr-decision"
                label="Resolution Decision"
                error={reviewForm.formState.errors.decision?.message}
                {...reviewForm.register('decision')}
              >
                <option value="LENDER_PROCESSING">Return to LENDER_PROCESSING</option>
                <option value="DECLINED">Mark DECLINED</option>
                <option value="CANCELLED">Mark CANCELLED</option>
              </Select>
            </div>
            <Input
              id="mr-reason"
              label="Resolution Reason"
              placeholder="Verified escalation documentation with operations lead"
              error={reviewForm.formState.errors.reason?.message}
              {...reviewForm.register('reason')}
            />
            <Button type="submit" loading={reviewMutation.isPending}>
              Submit Manual Review Decision
            </Button>
          </form>
        </Card>

        {/* Admin Merchant Commission Ledger Lookup (GET /ledger/commission?merchantId=...) */}
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-bold text-[#F8FAFC]">
            Inspect Merchant Commission Ledger (`?merchantId=...`)
          </h2>
          <Input
            id="admin-ledger-merchant"
            label="Merchant UUID"
            placeholder="Paste Merchant UUID to view net commissions"
            value={merchantLedgerId}
            onChange={(e) => setMerchantLedgerId(e.target.value)}
          />
          {ledgerQuery.error ? <ErrorState error={ledgerQuery.error} /> : null}
          {ledgerQuery.data ? (
            <div className="grid grid-cols-3 gap-4 pt-2 text-xs">
              <div>
                <span className="text-[#6B7280] block">Accrued</span>
                <MoneyDisplay
                  paise={ledgerQuery.data.totalAccruedPaise}
                  className="text-lg font-bold text-[#F8FAFC]"
                />
              </div>
              <div>
                <span className="text-[#6B7280] block">Reversed</span>
                <MoneyDisplay
                  paise={ledgerQuery.data.totalReversedPaise}
                  className="text-lg font-bold text-[#FBBF24]"
                />
              </div>
              <div>
                <span className="text-[#6B7280] block">Net</span>
                <MoneyDisplay
                  paise={ledgerQuery.data.netCommissionPaise}
                  className="text-lg font-bold text-[#C8FF32]"
                />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </DashboardLayout>
  );
}

