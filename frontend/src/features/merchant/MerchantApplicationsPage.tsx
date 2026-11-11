import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, Filter, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListRowsSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { ApplicationStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { applicationApi } from '@/lib/api/applicationApi';
import { merchantApi } from '@/lib/api/merchantApi';
import { formatDateTime, truncateId } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/api';

const PAGE_FILTER_STATUSES: ReadonlyArray<'ALL' | ApplicationStatus> = [
  'ALL',
  'CUSTOMER_CONSENT_PENDING',
  'OFFER_AVAILABLE',
  'CUSTOMER_ACCEPTED_OFFER',
  'DISBURSED',
  'DECLINED',
  'MANUAL_REVIEW',
  'TECHNICAL_FAILURE',
];

export function MerchantApplicationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusFilter, setStatusFilter] = useState<'ALL' | ApplicationStatus>('ALL');

  const appsQuery = useQuery({
    queryKey: ['merchant', 'applications', page, pageSize],
    queryFn: ({ signal }) => applicationApi.listApplications(page, pageSize, signal),
  });

  const shopsQuery = useQuery({
    queryKey: ['merchant', 'shops'],
    queryFn: ({ signal }) => merchantApi.listShops(signal),
  });

  const shopsById = new Map((shopsQuery.data ?? []).map((s) => [s.id, s.name]));
  const items = appsQuery.data?.items ?? [];
  const total = appsQuery.data?.meta.total ?? items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const visibleItems =
    statusFilter === 'ALL' ? items : items.filter((item) => item.status === statusFilter);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
              Financing Applications
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Paginated merchant financing ledger from{' '}
              <code className="font-mono text-xs">/api/v1/applications</code>.
            </p>
          </div>
          <Link to="/merchant/financing/new">
            <Button leftIcon={<PlusCircle className="h-4 w-4" />}>New Financing</Button>
          </Link>
        </div>

        {/* Client-side current page status chip filter (honest scope note) */}
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] mr-1">
              <Filter className="h-3.5 w-3.5" />
              Page Filter:
            </span>
            {PAGE_FILTER_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={
                  statusFilter === st
                    ? 'rounded-full bg-[#C8FF32] text-[#090A0C] px-3 py-1 text-[11px] font-bold'
                    : 'rounded-full border border-[rgba(255,255,255,0.1)] bg-[#181B21] text-[#9CA3AF] hover:text-[#F8FAFC] px-3 py-1 text-[11px] font-medium'
                }
              >
                {st === 'ALL' ? 'All on Page' : st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[#6B7280] shrink-0">
            Filters currently loaded page ({items.length} of {total} records)
          </span>
        </Card>

        {appsQuery.error ? (
          <ErrorState error={appsQuery.error} onRetry={() => appsQuery.refetch()} />
        ) : null}

        {appsQuery.isLoading ? (
          <ListRowsSkeleton rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 className="h-6 w-6" />}
            title="No financing applications yet"
            description="Launch the guided financing wizard to capture consent, purchase details, and fetch multi-lender offers."
            action={
              <Link to="/merchant/financing/new">
                <Button>Create your first financing request</Button>
              </Link>
            }
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title="No applications match this status on the current page"
            description="Reset the page filter or inspect another page."
            action={
              <Button variant="secondary" onClick={() => setStatusFilter('ALL')}>
                Reset Page Filter
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Mobile Stacked Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {visibleItems.map((app) => (
                <Link key={app.id} to={`/merchant/applications/${app.id}`}>
                  <Card interactive className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs text-[#F8FAFC]">
                          {truncateId(app.id)}
                        </span>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">
                          {shopsById.get(app.shopId) || truncateId(app.shopId)}
                        </p>
                      </div>
                      <ApplicationStatusBadge status={app.status} />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.06)]">
                      <MoneyDisplay
                        paise={app.requestedAmountPaise}
                        className="text-lg font-extrabold text-[#C8FF32]"
                      />
                      <span className="text-xs text-[#9CA3AF]">
                        {formatDateTime(app.createdAt)}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Desktop Table */}
            <Card className="hidden md:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-[rgba(255,255,255,0.08)] bg-[#181B21]/60 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    <tr>
                      <th className="px-5 py-3.5">Application ID</th>
                      <th className="px-5 py-3.5">Shop</th>
                      <th className="px-5 py-3.5">Mode / Tenure</th>
                      <th className="px-5 py-3.5 text-right">Requested</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Created</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-sm">
                    {visibleItems.map((app) => (
                      <tr key={app.id} className="hover:bg-[#181B21]/50 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs text-[#F8FAFC]">
                          {truncateId(app.id)}
                        </td>
                        <td className="px-5 py-4 text-[#9CA3AF]">
                          {shopsById.get(app.shopId) || truncateId(app.shopId)}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant="neutral">{app.routingMode}</Badge>
                          <span className="ml-2 text-xs text-[#9CA3AF]">
                            {app.requestedTenureMonths ? `${app.requestedTenureMonths}M` : 'Any'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-[#F8FAFC]">
                          <MoneyDisplay paise={app.requestedAmountPaise} />
                        </td>
                        <td className="px-5 py-4">
                          <ApplicationStatusBadge status={app.status} />
                        </td>
                        <td className="px-5 py-4 text-xs text-[#9CA3AF]">
                          {formatDateTime(app.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link to={`/merchant/applications/${app.id}`}>
                            <Button size="sm" variant="secondary">
                              Inspect
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span>
                  Page {page} of {totalPages} ({total} total records)
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

