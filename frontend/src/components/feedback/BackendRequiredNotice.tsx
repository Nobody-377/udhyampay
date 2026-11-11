import { Layers, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export interface BackendRequiredNoticeProps {
  title: string;
  description: string;
  requiredEndpoints: readonly string[];
}

export function BackendRequiredNotice({
  title,
  description,
  requiredEndpoints,
}: BackendRequiredNoticeProps) {
  return (
    <Card className="p-6 border-[#FBBF24]/30 bg-[rgba(251,191,36,0.03)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-[rgba(251,191,36,0.14)] text-[#FBBF24] flex items-center justify-center">
          <Layers className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[#F8FAFC]">{title}</h3>
            <Badge variant="warning">Backend API Required</Badge>
          </div>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">{description}</p>
          <div className="pt-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
              <Terminal className="h-3.5 w-3.5" />
              <span>Required Backend Contracts</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {requiredEndpoints.map((ep) => (
                <code
                  key={ep}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#181B21] px-2.5 py-1 font-mono text-xs text-[#F8FAFC]"
                >
                  {ep}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

