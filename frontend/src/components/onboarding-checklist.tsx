"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { youtube } from "@/lib/youtube";
import { groups as groupsApi } from "@/lib/groups";

const DISMISS_KEY = "reunifyd:onboarding-dismissed";

type Step = {
  id: string;
  label: string;
  done: boolean;
  href: string;
  cta: string;
};

export function OnboardingChecklist() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {}

    let cancelled = false;
    Promise.all([
      youtube.channels().catch(() => ({ channels: [] as Awaited<ReturnType<typeof youtube.channels>>["channels"] })),
      groupsApi.list().catch(() => ({ ok: false as const, groups: [] })),
    ]).then(([chRes, grRes]) => {
      if (cancelled) return;
      const channels = chRes.channels ?? [];
      const hasChannel = channels.length > 0;
      const hasSync = channels.some((c) => !!c.last_synced_at);
      const hasGroup =
        grRes && "groups" in grRes && Array.isArray(grRes.groups)
          ? grRes.groups.length > 0
          : false;
      setSteps([
        {
          id: "connect",
          label: "Connect your first YouTube channel",
          done: hasChannel,
          href: "/dashboard/channels",
          cta: "Connect channel",
        },
        {
          id: "sync",
          label: "Run your first sync",
          done: hasSync,
          href: "/dashboard/sync",
          cta: "Open sync status",
        },
        {
          id: "group",
          label: "Create a content group to compare videos",
          done: hasGroup,
          href: "/dashboard/groups/new",
          cta: "Create group",
        },
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !steps) return null;
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  if (done === total) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Get started</h2>
          <p className="text-xs text-[var(--ink-2)]">
            {done} of {total} steps complete
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-1)]"
          aria-label="Dismiss onboarding"
          title="Dismiss"
        >
          Hide ✕
        </button>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${
                s.done
                  ? "bg-emerald-500 text-white"
                  : "border border-[var(--border)] text-[var(--ink-3)]"
              }`}
              aria-hidden
            >
              {s.done ? "✓" : ""}
            </span>
            <span
              className={`flex-1 ${
                s.done ? "text-[var(--ink-2)] line-through" : "text-[var(--ink-1)]"
              }`}
            >
              {s.label}
            </span>
            {!s.done ? (
              <Link href={s.href} className="btn text-xs">
                {s.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
