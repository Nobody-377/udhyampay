import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getFriendlyErrorMessage } from '@/lib/api/error';

export interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title, onRetry }: ErrorStateProps) {
  const friendly = getFriendlyErrorMessage(error);

  return (
    <Card className="p-6 border-[#F87171]/30 bg-[rgba(248,113,113,0.04)]" role="alert">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-[rgba(248,113,113,0.14)] text-[#F87171] flex items-center justify-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1.5">
          <h3 className="text-base font-bold text-[#F8FAFC]">{title || friendly.title}</h3>
          <p className="text-sm text-[#9CA3AF]">{friendly.message}</p>
          {friendly.details && friendly.details.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-[#F87171]">
              {friendly.details.map((d, idx) => (
                <li key={idx}>
                  {d.path ? `${d.path}: ` : ''}
                  {d.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {friendly.code ? (
              <span className="font-mono text-xs text-[#6B7280]">Code: {friendly.code}</span>
            ) : null}
            {friendly.requestId ? (
              <span className="font-mono text-xs text-[#6B7280]">
                Request ID: {friendly.requestId}
              </span>
            ) : null}
          </div>
        </div>
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Try again
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

