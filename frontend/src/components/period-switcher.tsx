"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";

const PRESETS: Array<{ days: number; label: string }> = [
  { days: 7, label: "Last 7 days" },
  { days: 28, label: "Last 28 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 365 days" },
];

function PeriodSwitcherInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = Number(params.get("days") || 28);

  function pick(days: number) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("days", String(days));
    router.replace(`${pathname}?${sp.toString()}`);
  }

  const match = PRESETS.find((p) => p.days === current) ?? PRESETS[1];

  return (
    <div className="relative">
      <details className="group">
        <summary className="btn list-none cursor-pointer [&::-webkit-details-marker]:hidden">
          {match.label}
          <span className="text-[var(--ink-2)]">⌄</span>
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={(e) => {
                pick(p.days);
                (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute(
                  "open",
                );
              }}
              className={[
                "block w-full px-3 py-2 text-left text-sm transition",
                current === p.days
                  ? "bg-[var(--bg-2)] font-semibold"
                  : "hover:bg-[var(--bg-2)]",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export function PeriodSwitcher() {
  return (
    <Suspense fallback={<div className="btn">Last 28 days</div>}>
      <PeriodSwitcherInner />
    </Suspense>
  );
}

/** Reads `?days=` from the URL with a default of 28. */
export function useDays(defaultDays = 28): number {
  const params = useSearchParams();
  const n = Number(params.get("days"));
  return Number.isFinite(n) && n > 0 ? n : defaultDays;
}
