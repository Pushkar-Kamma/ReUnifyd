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

type MetricKey = "views" | "watch_time_minutes" | "subscribers_net" | "estimated_revenue";

const METRICS: Record<
  MetricKey,
  { label: string; color: string; format: (v: number) => string; pick: (r: DailyMetric) => number }
> = {
  views: {
    label: "Views",
    color: "var(--accent)",
    format: (v) => formatCount(v),
    pick: (r) => r.views ?? 0,
  },
  watch_time_minutes: {
    label: "Watch time (min)",
    color: "#8b5cf6",
    format: (v) => formatCount(v),
    pick: (r) => r.watch_time_minutes ?? 0,
  },
  subscribers_net: {
    label: "Subscribers (net)",
    color: "#22c55e",
    format: (v) => (v >= 0 ? `+${formatCount(v)}` : formatCount(v)),
    pick: (r) => (r.subscribers_gained ?? 0) - (r.subscribers_lost ?? 0),
  },
  estimated_revenue: {
    label: "Est. revenue",
    color: "#f59e0b",
    format: (v) => `$${v.toFixed(2)}`,
    pick: (r) => r.estimated_revenue ?? 0,
  },
};

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
  const [metric, setMetric] = useState<MetricKey>("views");

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
        <KpiCard
          label="Views"
          value={formatCount(totals.views)}
          active={metric === "views"}
          onClick={() => setMetric("views")}
        />
        <KpiCard
          label="Watch time"
          value={`${formatCount(Math.round(totals.watchHours))} h`}
          active={metric === "watch_time_minutes"}
          onClick={() => setMetric("watch_time_minutes")}
        />
        <KpiCard
          label="Subscribers"
          value={`${totals.subsNet >= 0 ? "+" : ""}${formatCount(totals.subsNet)}`}
          active={metric === "subscribers_net"}
          onClick={() => setMetric("subscribers_net")}
        />
        <KpiCard
          label="Est. revenue"
          value={`$${totals.revenue.toFixed(2)}`}
          active={metric === "estimated_revenue"}
          onClick={() => setMetric("estimated_revenue")}
        />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Daily {METRICS[metric].label.toLowerCase()}
          </h3>
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
                data={series.map((r) => ({ date: r.date, value: METRICS[metric].pick(r) }))}
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
                  tickFormatter={(v: number) => METRICS[metric].format(v)}
                  stroke="var(--ink-2)"
                />
                <Tooltip
                  formatter={(v) => [METRICS[metric].format(Number(v) || 0), METRICS[metric].label]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "white",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={METRICS[metric].color}
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

function KpiCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={[
        "card p-4 text-left transition",
        active
          ? "outline outline-2 outline-[var(--accent)]"
          : onClick
            ? "hover:-translate-y-0.5 hover:shadow-md"
            : "",
      ].join(" ")}
    >
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
    </button>
  );
}
