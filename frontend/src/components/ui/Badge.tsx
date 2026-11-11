import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { StatusTone } from '@/lib/status-meta';

export type BadgeVariant = StatusTone | 'demo';

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[rgba(255,255,255,0.06)] text-[#9CA3AF] border-[rgba(255,255,255,0.1)]',
  lime: 'bg-[rgba(200,255,50,0.14)] text-[#C8FF32] border-[rgba(200,255,50,0.3)]',
  success: 'bg-[rgba(52,211,153,0.12)] text-[#34D399] border-[rgba(52,211,153,0.28)]',
  warning: 'bg-[rgba(251,191,36,0.12)] text-[#FBBF24] border-[rgba(251,191,36,0.28)]',
  danger: 'bg-[rgba(248,113,113,0.12)] text-[#F87171] border-[rgba(248,113,113,0.28)]',
  info: 'bg-[rgba(96,165,250,0.12)] text-[#93C5FD] border-[rgba(96,165,250,0.28)]',
  demo: 'bg-[rgba(245,158,11,0.14)] text-[#FBBF24] border-[rgba(245,158,11,0.35)]',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap',
        BADGE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

