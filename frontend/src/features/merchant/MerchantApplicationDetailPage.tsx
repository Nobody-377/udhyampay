import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { Modal } from '@/components/ui/Modal';
import { KpiGridSkeleton, ListRowsSkeleton } from '@/components/ui/Skeleton';
import { AsyncPendingCard } from '@/components/feedback/AsyncPendingCard';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ApplicationTimeline } from '@/components/financial/ApplicationTimeline';
import {
  DocumentUploadPlaceholder,
  VerificationProgress,
} from '@/components/financial/KycPrimitives';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { OfferCard } from '@/components/financial/OfferCard';
import { ApplicationStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { applicationApi } from '@/lib/api/applicationApi';
import { offerApi } from '@/lib/api/offerApi';
import {
  APPLICATION_STATUS_META,
  canMerchantCancelApplication,
} from '@/lib/status-meta';
import { formatDateTime } from '@/lib/utils';
import type { KycStepItem } from '@/types/future';

export function MerchantApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Customer requested cancellation');
  const [actionError, setActionError] = useState<unknown>(null);

  const detailQuery = useQuery({
    queryKey: ['merchant', 'application', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => applicationApi.getApplication(id!, signal),
    refetchInterval: (query) => {
      const status = query.state.data?.application.status;
      return status && APPLICATION_STATUS_META[status]?.isAsyncPending ? 10000 : false;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['merchant', 'application', id, 'history'],
    enabled: Boolean(id),
    queryFn: ({ signal }) => applicationApi.getHistory(id!, signal),
  });

  const submitMutation = useMutation({
    mutationFn: () => applicationApi.submitApplication(id!),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'application', id] });
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
    },
    onError: (err) => setActionError(err),
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => offerApi.acceptOffer(id!, offerId),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'application', id] });
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
    },
    onError: (err) => setActionError(err),
  });

  const cancelMutation = useMutation({
    mutationFn: () => applicationApi.cancelApplication(id!, cancelReason),
    onSuccess: () => {
      setCancelOpen(false);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'application', id] });
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
    },
    onError: (err) => setActionError(err),
  });

  const detail = detailQuery.data;
  const app = detail?.application;
  const offers = detail?.offers ?? [];
  const statusMeta = app ? APPLICATION_STATUS_META[app.status] : null;

  const futureClosingChecklist: KycStepItem[] = [
    {
      code: 'PAN',
      label: 'PAN & Credit Underwriting Check',
      description: 'Handled via lender aggregator integration',
      status: 'PENDING',
    },
    {
      code: 'ESIGN',
      label: 'Key Fact Statement (KFS) & Aadhaar e-Sign',
      description: 'Pre-disbursement contract execution',
      status: 'PENDING',
    },
    {
      code: 'EMANDATE',
      label: 'e-NACH / UPI Autopay Mandate',
      description: 'Automated EMI collection mandate',
      status: 'PENDING',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              to="/merchant/applications"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] hover:text-[#F8FAFC]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Applications</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
                Application Workspace
              </h1>
              {app ? <ApplicationStatusBadge status={app.status} /> : null}
            </div>
            {app ? <p className="font-mono text-xs text-[#6B7280]">{app.id}</p> : null}
          </div>

          {app ? (
            <div className="flex flex-wrap gap-2.5">
              {app.status === 'CUSTOMER_CONSENT_PENDING' ? (
                <Button
                  loading={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  leftIcon={<Send className="h-4 w-4" />}
                >
                  Submit to Lenders
                </Button>
              ) : null}
              {canMerchantCancelApplication(app.status) ? (
                <Button
                  variant="danger"
                  onClick={() => setCancelOpen(true)}
                  leftIcon={<XCircle className="h-4 w-4" />}
                >
                  Cancel Application
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {actionError ? <ErrorState error={actionError} /> : null}
        {detailQuery.error ? (
          <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
        ) : null}

        {detailQuery.isLoading || !detail || !app ? (
          <>
            <KpiGridSkeleton count={4} />
            <ListRowsSkeleton rows={5} />
          </>
        ) : (
          <>
            {/* Async / Status Banner */}
            {statusMeta?.isAsyncPending ? (
              <AsyncPendingCard
                statusLabel={statusMeta.label}
                explanation={statusMeta.description}
                isRefreshing={detailQuery.isFetching}
                onRefresh={() => {
                  detailQuery.refetch();
                  historyQuery.refetch();
                }}
              />
            ) : statusMeta && (app.status === 'DECLINED' || app.status === 'TECHNICAL_FAILURE') ? (
              <Card className="p-5 border-[#F87171]/35 bg-[rgba(248,113,113,0.06)]">
                <h3 className="text-sm font-bold text-[#F87171]">{statusMeta.label}</h3>
                <p className="text-xs text-[#9CA3AF] mt-1">{statusMeta.description}</p>
              </Card>
            ) : null}

            {/* Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card elevated className="p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Requested Financing
                </span>
                <MoneyDisplay
                  paise={app.requestedAmountPaise}
                  className="mt-1.5 block text-2xl font-extrabold text-[#C8FF32]"
                />
                <span className="text-xs text-[#9CA3AF] mt-1 block">
                  Down payment: <MoneyDisplay paise={app.downPaymentPaise} />
                </span>
              </Card>

              <Card className="p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Retail Purchase
                </span>
                <MoneyDisplay
                  paise={detail.purchase.amountPaise}
                  className="mt-1.5 block text-2xl font-extrabold text-[#F8FAFC]"
                />
                <span className="text-xs text-[#9CA3AF] mt-1 block truncate">
                  {detail.purchase.productDescription || detail.purchase.productCategory}
                </span>
              </Card>

              <Card className="p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Customer
                </span>
                <p className="mt-1.5 text-lg font-bold text-[#F8FAFC]">
                  {detail.customer.fullName}
                </p>
                <p className="font-mono text-xs text-[#9CA3AF] mt-1">{detail.customer.phone}</p>
              </Card>

              <Card className="p-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Orchestration Mode
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="neutral">{app.routingMode}</Badge>
                  <span className="text-sm font-bold text-[#F8FAFC]">
                    {app.requestedTenureMonths ? `${app.requestedTenureMonths} Months` : 'Flexible'}
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] mt-2">
                  Created {formatDateTime(app.createdAt)}
                </p>
              </Card>
            </div>

            {/* Additional Info State (Future KYC/Doc Upload Notice) */}
            {app.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? (
              <div className="space-y-4">
                <DocumentUploadPlaceholder requiredDocument="BANK_STATEMENT_LAST_3_MONTHS" />
                <BackendRequiredNotice
                  title="Additional document submission API required"
                  description="The backend state machine permits ADDITIONAL_INFORMATION_REQUIRED -> LENDER_PROCESSING, but no HTTP endpoint currently accepts supplemental underwriting files."
                  requiredEndpoints={[
                    'POST /api/v1/applications/:id/additional-info',
                    'POST /api/v1/documents/upload',
                  ]}
                />
              </div>
            ) : null}

            {/* Offers Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#F8FAFC]">Lender Offers Marketplace</h2>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    Real-time proposals returned by lender adapters.
                  </p>
                </div>
                <Badge variant="neutral">{offers.length} offer(s)</Badge>
              </div>

              {offers.length === 0 ? (
                <Card className="p-6 text-sm text-[#9CA3AF]">
                  No offers available for this application in its current state ({app.status}).
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {offers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      canAccept={app.status === 'OFFER_AVAILABLE'}
                      isAccepting={acceptOfferMutation.isPending}
                      onAccept={(offerId) => acceptOfferMutation.mutate(offerId)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Timeline + Future KYC / Mandate Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                {historyQuery.isLoading ? (
                  <ListRowsSkeleton rows={4} />
                ) : (
                  <ApplicationTimeline history={historyQuery.data ?? []} />
                )}
              </div>

              <div className="lg:col-span-5 space-y-4">
                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#F8FAFC]">
                      Closing &amp; Compliance Readiness
                    </h3>
                    <Badge variant="warning">Future KYC UI</Badge>
                  </div>
                  <p className="text-xs text-[#9CA3AF]">
                    Planned KYC, Key Fact Statement (KFS), e-Sign, and e-Mandate steps. These will
                    bind to live aggregator sessions once endpoints are approved.
                  </p>
                  <VerificationProgress steps={futureClosingChecklist} />
                </Card>
              </div>
            </div>
          </>
        )}

        <Modal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="Cancel Financing Application"
          description="Confirm cancellation. Cancelled applications enter a terminal state."
        >
          <div className="space-y-4">
            <Input
              id="cancel-reason"
              label="Cancellation Reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                Keep Application
              </Button>
              <Button
                variant="danger"
                loading={cancelMutation.isPending}
                disabled={cancelReason.trim().length < 3}
                onClick={() => cancelMutation.mutate()}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

