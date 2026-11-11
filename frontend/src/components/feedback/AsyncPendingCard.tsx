import { Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface AsyncPendingCardProps {
  statusLabel: string;
  explanation: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AsyncPendingCard({
  statusLabel,
  explanation,
  onRefresh,
  isRefreshing = false,
}: AsyncPendingCardProps) {
  return (
    <Card className="p-5 border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-[rgba(96,165,250,0.14)] text-[#93C5FD] flex items-center justify-center">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#F8FAFC]">{statusLabel}</h4>
            <p className="mt-1 text-sm text-[#9CA3AF]">{explanation}</p>
          </div>
        </div>
        {onRefresh ? (
          <Button
            variant="secondary"
            size="sm"
            loading={isRefreshing}
            onClick={onRefresh}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Check Status
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

