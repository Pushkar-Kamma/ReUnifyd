"use client";

import Link from "next/link";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

function DefaultIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

/**
 * Friendly empty-state block to replace plain "no data" messages.
 * Use anywhere a list, table, or chart is empty.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-2)] text-[var(--ink-3)]"
        aria-hidden="true"
      >
        {icon ?? <DefaultIcon />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
          <p className="max-w-sm text-sm text-[var(--ink-2)]">{description}</p>
        ) : null}
      </div>
      {actionLabel && (actionHref || onAction) ? (
        actionHref ? (
          <Link href={actionHref} className="btn accent mt-2">
            {actionLabel}
          </Link>
        ) : (
          <button onClick={onAction} className="btn accent mt-2">
            {actionLabel}
          </button>
        )
      ) : null}
    </div>
  );
}
