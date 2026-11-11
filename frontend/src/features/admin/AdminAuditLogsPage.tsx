import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { ListRowsSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { adminApi } from '@/lib/api/adminApi';
import { formatDateTime, truncateId } from '@/lib/utils';

export function AdminAuditLogsPage() {
  const [entityTypeInput, setEntityTypeInput] = useState('');
  const [entityIdInput, setEntityIdInput] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<{ entityType?: string; entityId?: string }>(
    {},
  );

  const logsQuery = useQuery({
    queryKey: ['admin', 'audit-logs', appliedFilter],
    queryFn: ({ signal }) => adminApi.listAuditLogs(appliedFilter, signal),
  });

  const logs = logsQuery.data?.items ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">Audit Logs</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Immutable platform audit trail from{' '}
            <code className="font-mono text-xs">/api/v1/admin/audit-logs</code>.
          </p>
        </div>

        {/* Backend Query Filter Bar */}
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedFilter({
                entityType: entityTypeInput.trim() || undefined,
                entityId: entityIdInput.trim() || undefined,
              });
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end"
          >
            <Input
              id="audit-entity-type"
              label="Entity Type"
              placeholder="Merchant, FinancingApplication, LenderConfiguration"
              value={entityTypeInput}
              onChange={(e) => setEntityTypeInput(e.target.value)}
            />
            <Input
              id="audit-entity-id"
              label="Entity ID"
              placeholder="UUID filter"
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" leftIcon={<Filter className="h-4 w-4" />}>
                Apply Filter
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEntityTypeInput('');
                  setEntityIdInput('');
                  setAppliedFilter({});
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </Card>

        {logsQuery.error ? (
          <ErrorState error={logsQuery.error} onRetry={() => logsQuery.refetch()} />
        ) : null}

        {logsQuery.isLoading ? (
          <ListRowsSkeleton rows={8} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-6 w-6" />}
            title="No audit logs found"
            description="No audit entries matched the selected entity filters."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-[rgba(255,255,255,0.08)] bg-[#181B21]/60 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  <tr>
                    <th className="px-5 py-3.5">Actor</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Entity</th>
                    <th className="px-5 py-3.5">Entity ID</th>
                    <th className="px-5 py-3.5">Request ID</th>
                    <th className="px-5 py-3.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-xs">
                  {logs.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#181B21]/50">
                      <td className="px-5 py-4">
                        <Badge variant="neutral">{entry.actorType}</Badge>
                        {entry.actorUserId ? (
                          <span className="block font-mono text-[11px] text-[#6B7280] mt-1">
                            {truncateId(entry.actorUserId)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-[#C8FF32]">
                        {entry.action}
                      </td>
                      <td className="px-5 py-4 text-[#F8FAFC]">{entry.entityType}</td>
                      <td className="px-5 py-4 font-mono text-[#9CA3AF]">
                        {entry.entityType === 'Merchant' && entry.entityId ? (
                          <Link
                            to={`/admin/merchants?merchantId=${entry.entityId}`}
                            className="text-[#C8FF32] hover:underline"
                          >
                            {truncateId(entry.entityId)}
                          </Link>
                        ) : entry.entityType === 'FinancingApplication' && entry.entityId ? (
                          <Link
                            to={`/admin/applications?applicationId=${entry.entityId}`}
                            className="text-[#C8FF32] hover:underline"
                          >
                            {truncateId(entry.entityId)}
                          </Link>
                        ) : (
                          truncateId(entry.entityId)
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-[#6B7280]">
                        {truncateId(entry.requestId)}
                      </td>
                      <td className="px-5 py-4 font-mono text-[#9CA3AF]">
                        {formatDateTime(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

