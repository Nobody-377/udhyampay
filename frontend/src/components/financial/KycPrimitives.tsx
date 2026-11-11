import { CheckCircle2, Clock, FileUp, ShieldAlert, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { KycStepItem, KycStepStatus } from '@/types/future';

const STATUS_BADGE: Record<KycStepStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Pending', variant: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', variant: 'info' },
  VERIFIED: { label: 'Verified', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  ACTION_REQUIRED: { label: 'Action Required', variant: 'warning' },
};

export function KycStepCard({ step }: { step: KycStepItem }) {
  const badge = STATUS_BADGE[step.status];
  return (
    <Card className="p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-[#9CA3AF]">
          {step.status === 'VERIFIED' ? (
            <CheckCircle2 className="h-5 w-5 text-[#34D399]" />
          ) : step.status === 'FAILED' ? (
            <XCircle className="h-5 w-5 text-[#F87171]" />
          ) : step.status === 'ACTION_REQUIRED' ? (
            <ShieldAlert className="h-5 w-5 text-[#FBBF24]" />
          ) : (
            <Clock className="h-5 w-5 text-[#9CA3AF]" />
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-[#F8FAFC]">{step.label}</h4>
          <p className="text-xs text-[#9CA3AF] mt-0.5">{step.description}</p>
          {step.maskedIdentifier ? (
            <p className="mt-1 font-mono text-xs text-[#6B7280]">{step.maskedIdentifier}</p>
          ) : null}
        </div>
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </Card>
  );
}

export function VerificationProgress({ steps }: { steps: readonly KycStepItem[] }) {
  const verifiedCount = steps.filter((s) => s.status === 'VERIFIED').length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
        <span className="font-semibold uppercase tracking-wider">Verification Progress</span>
        <span className="font-mono">
          {verifiedCount} / {steps.length} complete
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#181B21]">
        <div
          className="h-full bg-[#C8FF32] transition-all duration-300"
          style={{ width: `${steps.length ? (verifiedCount / steps.length) * 100 : 0}%` }}
        />
      </div>
      <div className="space-y-2.5 pt-2">
        {steps.map((step) => (
          <KycStepCard key={step.code} step={step} />
        ))}
      </div>
    </div>
  );
}

export function DocumentUploadPlaceholder({ requiredDocument }: { requiredDocument?: string }) {
  return (
    <Card className="p-5 border-dashed border-[rgba(255,255,255,0.16)] bg-[#111317] flex items-center gap-4">
      <div className="h-10 w-10 rounded-xl bg-[#181B21] flex items-center justify-center text-[#9CA3AF]">
        <FileUp className="h-5 w-5" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#F8FAFC]">
          Supporting Document Upload (Future KYC Integration)
        </h4>
        <p className="text-xs text-[#9CA3AF] mt-0.5">
          {requiredDocument ? `Requested: ${requiredDocument}. ` : ''}
          Pre-signed document upload endpoint is awaiting backend integration (BACKEND API REQUIRED).
        </p>
      </div>
    </Card>
  );
}

