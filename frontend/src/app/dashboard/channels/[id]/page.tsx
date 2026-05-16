"use client";

import Link from "next/link";
import Image from "next/image";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { youtube, type Channel, type DailyMetric } from "@/lib/youtube";
import { ApiError } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";
import { VideosTable } from "@/components/videos-table";

const DAYS = 28;

export default function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [series, setSeries] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ch, ts] = await Promise.all([
        youtube.channel(id),
        youtube.timeseries(id, DAYS),
      ]);
      setChannel(ch.channel);
      setSeries(ts.series);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load channel (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load channel.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await youtube.syncDaily(id, 30);
      // Best-effort: also pull video list + per-video metrics. Errors here
      // don't fail the whole sync — the daily metrics are already saved.
      try {
        await youtube.syncFull(id, 180);
      } catch {
        // ignore — videos will populate on next sync
      }
      if (r.skipped) {
        setSyncMsg(`Skipped: ${r.reason ?? "recently synced"}`);
      } else {
        setSyncMsg(`Synced ${r.inserted_rows ?? 0} day(s).`);
      }
      await load();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const totals = useMemo(() => {
    let views = 0;
    let watchMin = 0;
    let subsNet = 0;
    let revenue = 0;
    for (const r of series) {
      views += r.views ?? 0;
      watchMin += r.watch_time_minutes ?? 0;
      subsNet += (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0);
      revenue += r.estimated_revenue ?? 0;
    }
    return { views, watchHours: watchMin / 60, subsNet, revenue };
  }, [series]);

  if (loading) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <p className="text-[var(--ink-2)]">Loading…</p>
      </section>
    );
  }
  if (error || !channel) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <Link href="/dashboard/channels" className="text-sm text-[var(--accent)]">
          ← All channels
        </Link>
        <p className="mt-4 text-red-600">{error ?? "Channel not found."}</p>
      </section>
    );
  }

  const hasData = series.length > 0;

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <Link href="/dashboard/channels" className="text-sm text-[var(--accent)]">
        ← All channels
      </Link>

      <header className="mt-4 mb-8 flex items-center gap-4">
        {channel.avatar_url ? (
          <Image
            src={channel.avatar_url}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--bg-2)] text-2xl font-bold text-[var(--ink-2)]">
            {(channel.title || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold tracking-tight">
            {channel.title || "Untitled channel"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-2)]">
            {channel.custom_url ? <span>{channel.custom_url}</span> : null}
            <span>· {formatCount(channel.subscriber_count)} subscribers</span>
            <span>· synced {relativeTime(channel.last_synced_at)}</span>
          </div>
        </div>
        <button onClick={onSync} disabled={syncing} className="btn primary">
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </header>

      {syncMsg ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-3 text-sm"
          style={{ background: "rgba(58,119,255,0.06)" }}
        >
          {syncMsg}
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Last {DAYS} days
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Views" value={formatCount(totals.views)} />
        <KpiCard
          label="Watch time"
          value={`${formatCount(Math.round(totals.watchHours))} h`}
        />
        <KpiCard
          label="Subscribers"
          value={`${totals.subsNet >= 0 ? "+" : ""}${formatCount(totals.subsNet)}`}
        />
        <KpiCard label="Est. revenue" value={`$${totals.revenue.toFixed(2)}`} />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Daily views</h3>
          {!hasData ? (
            <span className="text-xs text-[var(--ink-2)]">
              No data yet — click &ldquo;Sync now&rdquo;
            </span>
          ) : null}
        </div>
        {hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  stroke="var(--ink-2)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatCount(v)}
                  stroke="var(--ink-2)"
                />
                <Tooltip
                  formatter={(v) => [formatCount(Number(v) || 0), "Views"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "white",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-40 place-items-center text-sm text-[var(--ink-2)]">
            No data for the last {DAYS} days yet.
          </div>
        )}
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Videos
      </h2>
      <VideosTable channelId={id} refreshKey={channel.last_synced_at ?? ""} />
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
