import { CircleDot } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { APPLICATION_STATUS_META } from '@/lib/status-meta';
import { formatDateTime } from '@/lib/utils';
import type { ApplicationStatusHistoryEntry } from '@/types/api';

export function ApplicationTimeline({ history }: { history: ApplicationStatusHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <Card className="p-6 text-sm text-[#9CA3AF]">
        No status transition entries recorded yet.
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-base font-bold text-[#F8FAFC] mb-5">Application Audit Timeline</h3>
      <ol className="relative border-l border-[rgba(255,255,255,0.1)] ml-2.5 space-y-6">
        {history.map((entry, idx) => {
          const meta = APPLICATION_STATUS_META[entry.toStatus];
          const isLatest = idx === history.length - 1;
          return (
            <li key={entry.id} className="pl-6 relative">
              <span
                className={
                  isLatest
                    ? 'absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-[#C8FF32] flex items-center justify-center text-[#090A0C]'
                    : 'absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-[#22262F] border border-[rgba(255,255,255,0.2)]'
                }
                aria-hidden="true"
              >
                {isLatest ? <CircleDot className="h-2.5 w-2.5" /> : null}
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-sm font-semibold text-[#F8FAFC]">{meta.label}</span>
                <time className="font-mono text-xs text-[#6B7280]">
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
              {entry.reason ? (
                <p className="mt-1 text-xs text-[#9CA3AF]">{entry.reason}</p>
              ) : null}
              <p className="mt-1 font-mono text-[11px] text-[#6B7280]">
                {entry.fromStatus ? `${entry.fromStatus} → ` : ''}
                {entry.toStatus} • Actor: {entry.actorType}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

