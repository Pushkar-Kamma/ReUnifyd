"use client";

import Link from "next/link";

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

/**
 * Friendly empty-state block to replace plain "no data" messages.
 * Use anywhere a list, table, or chart is empty.
 */
export function EmptyState({
  icon = "📊",
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-2)] text-2xl"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="max-w-sm text-sm text-[var(--ink-2)]">{description}</p>
        ) : null}
      </div>
      {actionLabel && (actionHref || onAction) ? (
        actionHref ? (
          <Link href={actionHref} className="btn primary mt-2">
            {actionLabel}
          </Link>
        ) : (
          <button onClick={onAction} className="btn primary mt-2">
            {actionLabel}
          </button>
        )
      ) : null}
    </div>
  );
}
