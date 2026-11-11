import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiGridSkeleton } from '@/components/ui/Skeleton';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { adminApi } from '@/lib/api/adminApi';
import { healthApi } from '@/lib/api/healthApi';
import { formatDateTime, truncateId } from '@/lib/utils';

export function AdminOverviewPage() {
  const auditQuery = useQuery({
    queryKey: ['admin', 'audit-logs', 'overview'],
    queryFn: ({ signal }) => adminApi.listAuditLogs({}, signal),
  });

  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: ({ signal }) => healthApi.getHealth(signal),
  });

  const readinessQuery = useQuery({
    queryKey: ['system', 'ready'],
    queryFn: ({ signal }) => healthApi.getReadiness(signal),
  });

  const logs = auditQuery.data?.items ?? [];
  const totalAuditLogs = auditQuery.data?.meta.total ?? logs.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
              Admin Operations Overview
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Connected operations tools and real-time audit telemetry. Unsupported global
              aggregates are explicitly gated rather than mocked.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/merchants">
              <Button size="sm" variant="secondary" leftIcon={<Building2 className="h-4 w-4" />}>
                Merchant Actions
              </Button>
            </Link>
            <Link to="/admin/applications">
              <Button size="sm" leftIcon={<ShieldCheck className="h-4 w-4" />}>
                Manual Review
              </Button>
            </Link>
          </div>
        </div>

        {auditQuery.error ? (
          <ErrorState error={auditQuery.error} onRetry={() => auditQuery.refetch()} />
        ) : null}

        {auditQuery.isLoading ? (
          <KpiGridSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card elevated limeHighlight className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C8FF32]">
                Recorded Audit Events
              </span>
              <div className="mt-2 text-3xl font-extrabold text-[#F8FAFC] font-tabular">
                {totalAuditLogs}
              </div>
              <Link
                to="/admin/audit-logs"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#C8FF32] hover:underline"
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Inspect Audit Logs</span>
              </Link>
            </Card>

            <Card className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                API Liveness (/health)
              </span>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={healthQuery.data?.status === 'ok' ? 'success' : 'warning'}>
                  {healthQuery.data?.status ?? 'Checking'}
                </Badge>
                {healthQuery.data ? (
                  <span className="font-mono text-xs text-[#9CA3AF]">
                    uptime {healthQuery.data.uptimeSeconds}s
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Database Readiness (/ready):{' '}
                <span className="font-mono text-[#F8FAFC]">
                  {readinessQuery.data?.status ?? 'checking'}
                </span>
              </p>
            </Card>

            <Card className="p-5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Lender Config Console
              </span>
              <p className="mt-2 text-sm font-bold text-[#F8FAFC]">
                Priority, Timeout &amp; Discovery Overrides
              </p>
              <Link
                to="/admin/lenders"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#C8FF32] hover:underline"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Configure by Lender ID</span>
              </Link>
            </Card>
          </div>
        )}

        {/* Recent Audit Events */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F8FAFC]">Latest Immutable Audit Events</h2>
            <Link to="/admin/audit-logs" className="text-xs font-semibold text-[#C8FF32] hover:underline">
              Full Audit Table →
            </Link>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No audit events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 6).map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{log.actorType}</Badge>
                    <span className="font-mono font-semibold text-[#C8FF32]">{log.action}</span>
                    <span className="text-[#9CA3AF]">
                      {log.entityType} ({truncateId(log.entityId)})
                    </span>
                  </div>
                  <span className="font-mono text-[#6B7280]">{formatDateTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Honest Gate for Missing Aggregate Endpoints */}
        <BackendRequiredNotice
          title="Platform Aggregate KPIs, Charts & Directories Require Backend List APIs"
          description="Per audit findings, existing backend stores support listing users, merchants, and lenders internally, but admin.routes.ts does not yet expose collection list or time-series analytics endpoints. Charts and user/utility volume tables are intentionally withheld until implemented."
          requiredEndpoints={[
            'GET /api/v1/admin/analytics/overview',
            'GET /api/v1/admin/users',
            'GET /api/v1/admin/merchants',
            'GET /api/v1/admin/lenders',
            'GET /api/v1/admin/applications',
            'GET /api/v1/admin/transactions',
            'GET /api/v1/admin/webhooks',
          ]}
        />
      </div>
    </DashboardLayout>
  );
}

