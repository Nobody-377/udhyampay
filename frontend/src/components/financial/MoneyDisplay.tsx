import { formatPaiseToInr, type PaiseInput } from '@/lib/money/paise';
import { cn } from '@/lib/utils';

export interface MoneyDisplayProps {
  paise: PaiseInput;
  includeDecimals?: boolean;
  className?: string;
}

export function MoneyDisplay({ paise, includeDecimals = true, className }: MoneyDisplayProps) {
  return (
    <span className={cn('font-tabular tracking-tight', className)}>
      {formatPaiseToInr(paise, { includeDecimals })}
    </span>
  );
}

