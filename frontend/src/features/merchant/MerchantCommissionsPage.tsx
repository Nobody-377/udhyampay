import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeIndianRupee } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiGridSkeleton, ListRowsSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { ledgerApi } from '@/lib/api/ledgerApi';
import { formatDateTime, truncateId } from '@/lib/utils';

export function MerchantCommissionsPage() {
  const [skip, setSkip] = useState(0);
  const take = 25;

  const ledgerQuery = useQuery({
    queryKey: ['merchant', 'ledger', skip, take],
    queryFn: ({ signal }) => ledgerApi.getCommissionSummary({ skip, take }, signal),
  });

  const summary = ledgerQuery.data;
  const entries = summary?.entries ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">Commission Ledger</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Append-only double-entry commission ledger from{' '}
            <code className="font-mono text-xs">/api/v1/ledger/commission</code>. Accruals record
            only upon lender-confirmed disbursement.
          </p>
        </div>

        {ledgerQuery.error ? (
          <ErrorState error={ledgerQuery.error} onRetry={() => ledgerQuery.refetch()} />
        ) : null}

        {ledgerQuery.isLoading ? (
          <>
            <KpiGridSkeleton count={3} />
            <ListRowsSkeleton rows={5} />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-6">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Total Accrued
                </span>
                <MoneyDisplay
                  paise={summary?.totalAccruedPaise ?? '0'}
                  className="mt-2 block text-3xl font-extrabold text-[#F8FAFC]"
                />
              </Card>

              <Card className="p-6">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Total Reversed
                </span>
                <MoneyDisplay
                  paise={summary?.totalReversedPaise ?? '0'}
                  className="mt-2 block text-3xl font-extrabold text-[#FBBF24]"
                />
              </Card>

              <Card elevated limeHighlight className="p-6">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C8FF32]">
                  Net Commission
                </span>
                <MoneyDisplay
                  paise={summary?.netCommissionPaise ?? '0'}
                  className="mt-2 block text-3xl font-extrabold text-[#C8FF32]"
                />
              </Card>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                icon={<BadgeIndianRupee className="h-6 w-6" />}
                title="No commission entries yet"
                description="Commission ledger rows are created automatically when a financing application completes confirmed disbursement."
              />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="border-b border-[rgba(255,255,255,0.08)] bg-[#181B21]/60 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                      <tr>
                        <th className="px-5 py-3.5">Entry Type</th>
                        <th className="px-5 py-3.5">Rule Code</th>
                        <th className="px-5 py-3.5">Application</th>
                        <th className="px-5 py-3.5">Transaction</th>
                        <th className="px-5 py-3.5 text-right">Amount</th>
                        <th className="px-5 py-3.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-sm">
                      {entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-[#181B21]/50">
                          <td className="px-5 py-4">
                            <Badge
                              variant={
                                entry.entryType === 'ACCRUAL'
                                  ? 'success'
                                  : entry.entryType === 'REVERSAL'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {entry.entryType}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#F8FAFC]">
                            {entry.ruleCode}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#9CA3AF]">
                            {truncateId(entry.applicationId)}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#9CA3AF]">
                            {truncateId(entry.transactionId)}
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-[#F8FAFC]">
                            <MoneyDisplay paise={entry.amountPaise} />
                          </td>
                          <td className="px-5 py-4 text-xs text-[#9CA3AF]">
                            {formatDateTime(entry.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between px-5 py-3.5 border-t border-[rgba(255,255,255,0.08)] text-xs text-[#9CA3AF]">
                  <span>Showing offset {skip} (limit {take})</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={skip === 0}
                      onClick={() => setSkip((s) => Math.max(0, s - take))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={entries.length < take}
                      onClick={() => setSkip((s) => s + take)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

