import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { adminApi } from '@/lib/api/adminApi';
import type { LenderConfiguration } from '@/types/api';

export function AdminLendersPage() {
  const [lenderId, setLenderId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState('10');
  const [requestTimeoutMs, setRequestTimeoutMs] = useState('10000');
  const [supportsDiscovery, setSupportsDiscovery] = useState(true);
  const [fallbackOnDecline, setFallbackOnDecline] = useState(true);
  const [savedConfig, setSavedConfig] = useState<LenderConfiguration | null>(null);
  const [error, setError] = useState<unknown>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateLenderConfig(lenderId.trim(), {
        enabled,
        priority: Number(priority),
        requestTimeoutMs: Number(requestTimeoutMs),
        supportsDiscovery,
        fallbackOnDecline,
      }),
    onSuccess: (config) => {
      setSavedConfig(config);
      setError(null);
    },
    onError: (err) => setError(err),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Lender Configuration
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Update routing flags via{' '}
            <code className="font-mono text-xs">PUT /api/v1/admin/lenders/:id/config</code>.
          </p>
        </div>

        <BackendRequiredNotice
          title="Lender Directory & BigInt Coercion Improvements Needed"
          description="GET /api/v1/admin/lenders is required to browse Lender UUIDs dynamically. Additionally, minAmountPaise / maxAmountPaise updates are omitted here because PUT /lenders/:id/config passes JSON directly without BigInt coercion (BACKEND CHANGE REQUIRED)."
          requiredEndpoints={['GET /api/v1/admin/lenders', 'PUT /api/v1/admin/lenders/:id/config (Zod coercion)']}
        />

        {error ? <ErrorState error={error} /> : null}

        {savedConfig ? (
          <Card elevated limeHighlight className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#34D399] font-bold text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Lender Configuration Updated</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-[#9CA3AF]">
              <div>Enabled: {String(savedConfig.enabled)}</div>
              <div>Priority: {savedConfig.priority}</div>
              <div>Timeout: {savedConfig.requestTimeoutMs}ms</div>
              <div>Discovery: {String(savedConfig.supportsDiscovery)}</div>
            </div>
          </Card>
        ) : null}

        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#F8FAFC]">Update Lender Routing Settings</h2>
            <Badge variant="demo">
              <FlaskConical className="h-3 w-3" />
              Seeded Lenders Are Simulated
            </Badge>
          </div>

          <div className="space-y-4">
            <Input
              id="lender-uuid"
              label="Lender UUID"
              placeholder="Paste Lender UUID from DB or seed-demo output"
              value={lenderId}
              onChange={(e) => setLenderId(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="lender-priority"
                label="Priority (Lower runs first)"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <Input
                id="lender-timeout"
                label="Request Timeout (ms)"
                type="number"
                value={requestTimeoutMs}
                onChange={(e) => setRequestTimeoutMs(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#C8FF32]"
                />
                <span>Enabled</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportsDiscovery}
                  onChange={(e) => setSupportsDiscovery(e.target.checked)}
                  className="h-4 w-4 accent-[#C8FF32]"
                />
                <span>Discovery Enabled</span>
              </label>
              <label className="flex items-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fallbackOnDecline}
                  onChange={(e) => setFallbackOnDecline(e.target.checked)}
                  className="h-4 w-4 accent-[#C8FF32]"
                />
                <span>Fallback on Decline</span>
              </label>
            </div>

            <Button
              loading={updateMutation.isPending}
              disabled={lenderId.trim().length < 10}
              onClick={() => updateMutation.mutate()}
            >
              Save Configuration
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

