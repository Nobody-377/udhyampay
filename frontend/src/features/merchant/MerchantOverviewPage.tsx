import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeIndianRupee,
  FileCheck2,
  PlusCircle,
  QrCode,
  ShieldAlert,
  Store,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiGridSkeleton, ListRowsSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { ApplicationStatusBadge, MerchantStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { applicationApi } from '@/lib/api/applicationApi';
import { ledgerApi } from '@/lib/api/ledgerApi';
import { merchantApi } from '@/lib/api/merchantApi';
import { purchaseApi } from '@/lib/api/purchaseApi';
import { sumPaise } from '@/lib/money/paise';
import { formatDateTime, truncateId } from '@/lib/utils';

export function MerchantOverviewPage() {
  const merchantQuery = useQuery({
    queryKey: ['merchant', 'me'],
    queryFn: ({ signal }) => merchantApi.getMe(signal),
  });

  const shopsQuery = useQuery({
    queryKey: ['merchant', 'shops'],
    queryFn: ({ signal }) => merchantApi.listShops(signal),
  });

  const purchasesQuery = useQuery({
    queryKey: ['merchant', 'purchases', 1, 20],
    queryFn: ({ signal }) => purchaseApi.listPurchases(1, 20, signal),
  });

  const applicationsQuery = useQuery({
    queryKey: ['merchant', 'applications', 1, 50],
    queryFn: ({ signal }) => applicationApi.listApplications(1, 50, signal),
  });

  const ledgerQuery = useQuery({
    queryKey: ['merchant', 'ledger'],
    queryFn: ({ signal }) => ledgerApi.getCommissionSummary({ skip: 0, take: 10 }, signal),
  });

  const apps = applicationsQuery.data?.items ?? [];
  const purchases = purchasesQuery.data?.items ?? [];
  const totalAppsCount = applicationsQuery.data?.meta.total ?? apps.length;

  const approvedStatuses = new Set([
    'OFFER_AVAILABLE',
    'CUSTOMER_ACCEPTED_OFFER',
    'LENDER_FINAL_CONFIRMATION',
    'DISBURSEMENT_PENDING',
    'DISBURSED',
  ]);
  const approvedApps = apps.filter((a) => approvedStatuses.has(a.status));
  const disbursedApps = apps.filter((a) => a.status === 'DISBURSED');
  const totalFinancedPaise = sumPaise(
    approvedApps.map((a) => a.requestedAmountPaise),
  );

  const statusChartData = [
    { name: 'Pending/Sub', count: apps.filter((a) => ['CUSTOMER_CONSENT_PENDING', 'SUBMITTED', 'LENDER_PROCESSING'].includes(a.status)).length },
    { name: 'Offers', count: apps.filter((a) => a.status === 'OFFER_AVAILABLE').length },
    { name: 'Accepted', count: apps.filter((a) => ['CUSTOMER_ACCEPTED_OFFER', 'LENDER_FINAL_CONFIRMATION', 'DISBURSEMENT_PENDING'].includes(a.status)).length },
    { name: 'Disbursed', count: disbursedApps.length },
    { name: 'Declined/Fail', count: apps.filter((a) => ['DECLINED', 'TECHNICAL_FAILURE'].includes(a.status)).length },
  ];

  const isLoading =
    merchantQuery.isLoading ||
    shopsQuery.isLoading ||
    purchasesQuery.isLoading ||
    applicationsQuery.isLoading ||
    ledgerQuery.isLoading;

  const primaryError =
    merchantQuery.error ||
    applicationsQuery.error ||
    purchasesQuery.error ||
    ledgerQuery.error;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Greeting & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
                {merchantQuery.data?.tradeName || merchantQuery.data?.legalName || 'Merchant Overview'}
              </h1>
              {merchantQuery.data ? (
                <MerchantStatusBadge status={merchantQuery.data.status} />
              ) : null}
            </div>
            <p className="text-sm text-[#9CA3AF]">
              Multi-lender financing pipeline, retail checkout sessions, and net commission ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/merchant/financing/new">
              <Button leftIcon={<PlusCircle className="h-4 w-4" />}>New Financing</Button>
            </Link>
            <Link to="/merchant/purchases">
              <Button variant="secondary" leftIcon={<QrCode className="h-4 w-4" />}>
                Generate QR
              </Button>
            </Link>
            <Link to="/merchant/applications">
              <Button variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />}>
                View Applications
              </Button>
            </Link>
          </div>
        </div>

        {/* Merchant Verification Notice */}
        {merchantQuery.data && merchantQuery.data.status !== 'VERIFIED' ? (
          <Card className="p-4 border-[#FBBF24]/35 bg-[rgba(251,191,36,0.06)] flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-[#FBBF24] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-[#F8FAFC]">
                Merchant Account Status: {merchantQuery.data.status}
              </p>
              <p className="text-[#9CA3AF]">
                {merchantQuery.data.status === 'PENDING_VERIFICATION'
                  ? 'Administrator verification is pending (PATCH /api/v1/admin/merchants/:id/status).'
                  : `Account suspended: ${merchantQuery.data.suspensionReason || 'Contact operations admin.'}`}
              </p>
            </div>
          </Card>
        ) : null}

        {primaryError ? (
          <ErrorState
            error={primaryError}
            onRetry={() => {
              merchantQuery.refetch();
              applicationsQuery.refetch();
              purchasesQuery.refetch();
              ledgerQuery.refetch();
            }}
          />
        ) : null}

        {/* KPI Cards */}
        {isLoading ? (
          <KpiGridSkeleton count={5} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <Card elevated limeHighlight className="p-5 sm:col-span-2 xl:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C8FF32]">
                Total Financed (Approved / Disbursed Sample)
              </span>
              <MoneyDisplay
                paise={totalFinancedPaise}
                className="mt-2 block text-3xl sm:text-4xl font-extrabold text-[#F8FAFC]"
              />
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Across {approvedApps.length} approved/active-offer applications (loaded page)
              </p>
            </Card>

            <Card className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Applications
              </span>
              <div className="mt-2 text-3xl font-extrabold text-[#F8FAFC] font-tabular">
                {totalAppsCount}
              </div>
              <p className="mt-2 text-xs text-[#9CA3AF]">
                {approvedApps.length} approved / offered • {disbursedApps.length} disbursed
              </p>
            </Card>

            <Card className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Active Shops
              </span>
              <div className="mt-2 text-3xl font-extrabold text-[#F8FAFC] font-tabular">
                {shopsQuery.data?.length ?? 0}
              </div>
              <Link
                to="/merchant/shops"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#C8FF32] hover:underline"
              >
                <Store className="h-3.5 w-3.5" />
                <span>Manage shops</span>
              </Link>
            </Card>

            <Card className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Commission Earned
              </span>
              <MoneyDisplay
                paise={ledgerQuery.data?.netCommissionPaise ?? '0'}
                className="mt-2 block text-2xl sm:text-3xl font-extrabold text-[#34D399]"
              />
              <Link
                to="/merchant/commissions"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#9CA3AF] hover:text-[#F8FAFC]"
              >
                <BadgeIndianRupee className="h-3.5 w-3.5" />
                <span>View ledger</span>
              </Link>
            </Card>
          </div>
        )}

        {/* Application Pipeline Chart + Recent Applications */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-5 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[#F8FAFC]">Application Funnel</h2>
                  <p className="text-xs text-[#9CA3AF]">Distribution from current API page</p>
                </div>
                <Badge variant="neutral">{apps.length} loaded</Badge>
              </div>

              {apps.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#6B7280]">
                  Create a financing request to populate pipeline metrics.
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#6B7280"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#6B7280"
                        fontSize={11}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#181B21',
                          borderColor: 'rgba(255,255,255,0.12)',
                          borderRadius: '12px',
                          color: '#F8FAFC',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" fill="#C8FF32" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-7 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F8FAFC]">Recent Applications</h2>
              <Link
                to="/merchant/applications"
                className="text-xs font-semibold text-[#C8FF32] hover:underline"
              >
                View all
              </Link>
            </div>

            {applicationsQuery.isLoading ? (
              <ListRowsSkeleton rows={4} />
            ) : apps.length === 0 ? (
              <EmptyState
                icon={<FileCheck2 className="h-5 w-5" />}
                title="No financing applications yet"
                description="Create your first financing request for a retail electronics purchase."
                action={
                  <Link to="/merchant/financing/new">
                    <Button size="sm">Create Financing Request</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {apps.slice(0, 5).map((app) => (
                  <Link
                    key={app.id}
                    to={`/merchant/applications/${app.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3.5 hover:border-[#C8FF32]/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#F8FAFC]">
                          {truncateId(app.id)}
                        </span>
                        <span className="text-[11px] font-mono text-[#6B7280]">
                          {app.routingMode}
                        </span>
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-1">
                        Created {formatDateTime(app.createdAt)}
                        {app.requestedTenureMonths ? ` • ${app.requestedTenureMonths}M` : ''}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <MoneyDisplay
                        paise={app.requestedAmountPaise}
                        className="text-sm font-bold text-[#F8FAFC]"
                      />
                      <ApplicationStatusBadge status={app.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Purchases */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F8FAFC]">Recent Retail Purchases</h2>
            <Link
              to="/merchant/purchases"
              className="text-xs font-semibold text-[#C8FF32] hover:underline"
            >
              Manage purchases
            </Link>
          </div>

          {purchasesQuery.isLoading ? (
            <ListRowsSkeleton rows={3} />
          ) : purchases.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No retail purchases recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {purchases.slice(0, 3).map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="neutral">{purchase.productCategory}</Badge>
                    <MoneyDisplay
                      paise={purchase.amountPaise}
                      className="text-base font-bold text-[#C8FF32]"
                    />
                  </div>
                  <p className="text-xs text-[#F8FAFC] truncate">
                    {purchase.productDescription || 'Electronics Purchase'}
                  </p>
                  <p className="font-mono text-[11px] text-[#6B7280]">
                    {formatDateTime(purchase.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Transparent Missing Merchant APIs Note */}
        <BackendRequiredNotice
          title="Additional Merchant Modules Awaiting Backend Endpoints"
          description="Customer CRM listing, staff management, merchant-level financial settlements, and time-range analytics charts are withheld until dedicated backend routes exist."
          requiredEndpoints={[
            'GET /api/v1/customers',
            'GET/POST /api/v1/merchants/staff',
            'GET /api/v1/transactions',
            'GET /api/v1/ledger/settlements',
            'GET /api/v1/merchants/analytics',
          ]}
        />
      </div>
    </DashboardLayout>
  );
}

