"use client";

/**
 * Reusable loading skeleton with subtle pulse animation.
 * Use as: <Skeleton className="h-4 w-32" /> or compose for full layouts.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-2)] ${className}`}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-t border-[var(--border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function KpiSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-20" />
    </div>
  );
}
