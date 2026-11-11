import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export function DemoModeBanner({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <Badge variant="demo" className={className}>
        <FlaskConical className="h-3 w-3" />
        <span>DEMO SANDBOX</span>
      </Badge>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.1)] px-4 py-2.5 text-xs text-[#FBBF24]',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0" />
        <span className="font-semibold">
          DEMO SANDBOX ENVIRONMENT — Simulated JSON lenders may return development test offers. Real
          bank/NBFC approvals occur only in verified live aggregator integrations.
        </span>
      </div>
      <Badge variant="demo">SIMULATED</Badge>
    </div>
  );
}

