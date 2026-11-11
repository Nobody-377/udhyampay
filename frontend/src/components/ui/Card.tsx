import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  interactive?: boolean;
  limeHighlight?: boolean;
  children: ReactNode;
}

export function Card({
  elevated = false,
  interactive = false,
  limeHighlight = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200 shadow-card',
        elevated ? 'bg-[#181B21]' : 'bg-[#111317]',
        limeHighlight
          ? 'border-[#C8FF32]/50 shadow-limeGlow'
          : 'border-[rgba(255,255,255,0.08)]',
        interactive && 'hover:border-[rgba(255,255,255,0.18)] hover:bg-[#16191F]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

