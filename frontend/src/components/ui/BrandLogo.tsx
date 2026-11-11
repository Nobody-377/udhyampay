import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function BrandLogo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 group focus-visible:rounded-lg">
      <div className="h-9 w-9 rounded-xl bg-[#C8FF32] flex items-center justify-center shadow-limeGlow transition-transform group-hover:scale-[1.03]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#090A0C]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4v9a6 6 0 0 0 12 0V4" />
          <path d="M12 10v9" />
          <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      {!compact ? (
        <div className="flex flex-col">
          <span className={cn('text-base font-extrabold tracking-tight text-[#F8FAFC] leading-none')}>
            Udyam <span className="text-[#C8FF32]">PAY</span>
          </span>
          <span className="text-[10px] font-medium tracking-widest uppercase text-[#6B7280] mt-0.5">
            Finance • Pay • Utilities
          </span>
        </div>
      ) : null}
    </Link>
  );
}

