"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { youtube, type Channel } from "@/lib/youtube";
import { useToast } from "@/components/toast";
import { CardSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { relativeTime } from "@/lib/format";

type SyncState = "idle" | "syncing" | "ok" | "error";

export default function SyncStatusPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<number, SyncState>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [nowMs, setNowMs] = useState(0);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await youtube.channels();
      setChannels(r.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channels");
    }
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
    void load();
  }, [load]);

  async function syncOne(c: Channel) {
    setStates((s) => ({ ...s, [c.id]: "syncing" }));
    setMessages((m) => ({ ...m, [c.id]: "" }));
    try {
      const r = await youtube.syncDaily(c.id, 30);
      try {
        await youtube.syncFull(c.id, 180);
      } catch {}
      const msg = r.skipped
        ? `Skipped: ${r.reason ?? "recently synced"}`
        : `Synced ${r.inserted_rows ?? 0} day(s)`;
      setStates((s) => ({ ...s, [c.id]: "ok" }));
      setMessages((m) => ({ ...m, [c.id]: msg }));
      toast(`${c.title || "Channel"}: ${msg}`, "success");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setStates((s) => ({ ...s, [c.id]: "error" }));
      setMessages((m) => ({ ...m, [c.id]: msg }));
      toast(`${c.title || "Channel"} sync failed`, "error");
    }
  }

  async function syncAll() {
    if (!channels) return;
    for (const c of channels) {
      await syncOne(c);
    }
  }

  if (error) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Sync status</h1>
        <div className="card p-5 text-sm text-red-600">{error}</div>
      </section>
    );
  }

  if (channels === null) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Sync status</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </section>
    );
  }

  if (channels.length === 0) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Sync status</h1>
        <EmptyState
          icon="📺"
          title="No channels connected"
          description="Connect a YouTube channel to start syncing analytics."
          actionLabel="Go to channels"
          actionHref="/dashboard/channels"
        />
      </section>
    );
  }

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync status</h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            Manage data freshness across your channels.
          </p>
        </div>
        <button
          onClick={() => void syncAll()}
          className="btn primary"
          disabled={Object.values(states).some((s) => s === "syncing")}
        >
          Sync all
        </button>
      </header>

      <ul className="space-y-2">
        {channels.map((c) => {
          const state = states[c.id] ?? "idle";
          const message = messages[c.id];
          const ageHrs = c.last_synced_at && nowMs
            ? (nowMs - Date.parse(c.last_synced_at)) / 3_600_000
            : null;
          const freshness =
            ageHrs == null
              ? { label: "Never synced", color: "bg-gray-200 text-gray-700" }
              : ageHrs < 6
                ? { label: "Fresh", color: "bg-emerald-100 text-emerald-700" }
                : ageHrs < 24
                  ? { label: "Recent", color: "bg-lime-100 text-lime-700" }
                  : ageHrs < 72
                    ? { label: "Stale", color: "bg-amber-100 text-amber-700" }
                    : { label: "Outdated", color: "bg-red-100 text-red-700" };
          return (
            <li
              key={c.id}
              className="card flex items-center gap-3 p-3"
            >
              {c.avatar_url ? (
                <Image
                  src={c.avatar_url}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--bg-2)] text-sm font-bold text-[var(--ink-2)]">
                  {(c.title || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/channels/${c.id}`}
                    className="truncate font-semibold hover:text-[var(--accent)] hover:underline"
                  >
                    {c.title || "Untitled channel"}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${freshness.color}`}
                  >
                    {freshness.label}
                  </span>
                </div>
                <div className="text-xs text-[var(--ink-2)]">
                  Last sync: {relativeTime(c.last_synced_at)}
                  {message ? ` · ${message}` : ""}
                </div>
              </div>
              <button
                onClick={() => void syncOne(c)}
                disabled={state === "syncing"}
                className="btn shrink-0"
              >
                {state === "syncing" ? "Syncing…" : "Sync"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
