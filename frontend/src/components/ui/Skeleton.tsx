import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-xl bg-[rgba(255,255,255,0.06)]',
        className,
      )}
    />
  );
}

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#111317] p-5 space-y-3"
        >
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#111317] p-4 space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b last:border-b-0 border-[rgba(255,255,255,0.06)]"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

