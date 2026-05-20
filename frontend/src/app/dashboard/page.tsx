"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDays } from "@/components/period-switcher";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiUrl } from "@/lib/api";
import { formatCount } from "@/lib/format";
import {
  youtube,
  type OverviewChannel,
  type OverviewResponse,
  type OverviewTopVideo,
} from "@/lib/youtube";

const SERIES_COLORS = [
  "#065fd4", // YT blue
  "#c00f0c", // YT red
  "#16a34a",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
  "#f97316",
];

type MetricKey = "views" | "watch_time_minutes" | "subs_net" | "estimated_revenue";
type ChartMetricKey = "views" | "watch_time_minutes" | "subs_net";

const METRICS: Record<MetricKey, { label: string; format: (v: number) => string }> = {
  views: { label: "Views", format: (v) => formatCount(v) },
  watch_time_minutes: {
    label: "Watch time (hours)",
    format: (v) => formatCount(Math.round(v / 60)),
  },
  subs_net: {
    label: "Subscribers",
    format: (v) => (v >= 0 ? `+${formatCount(v)}` : formatCount(v)),
  },
  estimated_revenue: {
    label: "Estimated revenue",
    format: (v) => `$${v.toFixed(2)}`,
  },
};

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function DeltaPill({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-xs text-[var(--ink-2)]">—</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className="text-xs font-medium"
      style={{ color: up ? "var(--ok)" : "var(--danger)" }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function OverviewInner() {
  const { user } = useAuth();
  const days = useDays(28);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("views");

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const r = await youtube.overview(days);
      setData(r);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load overview (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load overview.");
      }
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    // Revenue isn't in the daily series — fall back to views for the chart.
    const k: ChartMetricKey =
      metric === "estimated_revenue" ? "views" : (metric as ChartMetricKey);
    const all = new Map<string, Record<string, number | string>>();
    for (const s of data.series_by_channel) {
      const key = `ch_${s.channel_id}`;
      for (const row of s.daily) {
        const existing = all.get(row.date) ?? { date: row.date };
        existing[key] = row[k] ?? 0;
        all.set(row.date, existing);
      }
    }
    return Array.from(all.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [data, metric]);

  // The label displayed on the chart heading. Falls back to Views for revenue
  // because we don't ship daily revenue per-channel.
  const chartLabel =
    metric === "estimated_revenue"
      ? METRICS.views.label
      : METRICS[metric].label;

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-red-600" role="alert">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-[var(--ink-2)]">
        Loading…
      </div>
    );
  }

  const hasData = data.channels.length > 0;
  if (!hasData) {
    return <EmptyState />;
  }

  const totalsDelta = {
    views: pctDelta(data.totals.views, data.prev_totals.views),
    watch_time_minutes: pctDelta(
      data.totals.watch_time_minutes,
      data.prev_totals.watch_time_minutes,
    ),
    subs_net: pctDelta(data.totals.subs_net, data.prev_totals.subs_net),
    estimated_revenue: pctDelta(
      data.totals.estimated_revenue,
      data.prev_totals.estimated_revenue,
    ),
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{user?.name ? `, ${user.name}` : ""}.
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          Across all your channels in the last {data.days} days.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Views"
          value={METRICS.views.format(data.totals.views)}
          delta={totalsDelta.views}
          active={metric === "views"}
          onClick={() => setMetric("views")}
        />
        <KpiCard
          label="Watch time"
          value={`${formatCount(Math.round(data.totals.watch_time_minutes / 60))} h`}
          delta={totalsDelta.watch_time_minutes}
          active={metric === "watch_time_minutes"}
          onClick={() => setMetric("watch_time_minutes")}
        />
        <KpiCard
          label="Subscribers"
          value={METRICS.subs_net.format(data.totals.subs_net)}
          delta={totalsDelta.subs_net}
          active={metric === "subs_net"}
          onClick={() => setMetric("subs_net")}
        />
        <KpiCard
          label="Est. revenue"
          value={METRICS.estimated_revenue.format(data.totals.estimated_revenue)}
          delta={totalsDelta.estimated_revenue}
          active={metric === "estimated_revenue"}
          onClick={() => setMetric("estimated_revenue")}
        />
      </div>

      {/* Multi-line chart: one line per channel */}
      <div className="card mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Daily {chartLabel.toLowerCase()} by channel
          </h2>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => String(d).slice(5)}
                stroke="var(--ink-2)"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) =>
                  metric === "estimated_revenue"
                    ? `$${formatCount(v)}`
                    : formatCount(v)
                }
                stroke="var(--ink-2)"
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "white",
                  fontSize: 12,
                }}
                formatter={(v, name) => [METRICS[metric].format(Number(v) || 0), name]}
              />
              {data.series_by_channel.map((s, i) => (
                <Line
                  key={s.channel_id}
                  type="monotone"
                  dataKey={`ch_${s.channel_id}`}
                  name={s.title ?? `Channel ${s.channel_id}`}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Custom legend */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {data.series_by_channel.map((s, i) => (
            <span key={s.channel_id} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.title ?? `Channel ${s.channel_id}`}
            </span>
          ))}
        </div>
      </div>

      {/* Two-col: leaderboard + top videos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <ChannelsLeaderboard channels={data.channels} />
        <TopVideosCard videos={data.top_videos} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  active,
  onClick,
}: {
  label: string;
  value: string;
  delta: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kpi-card"
      data-clickable="true"
      data-active={active}
    >
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1">
        <DeltaPill pct={delta} />
        <span className="ml-1 text-xs text-[var(--ink-2)]">vs prev period</span>
      </div>
    </button>
  );
}

type SortKey = "views" | "watch_time_minutes" | "subs_net" | "estimated_revenue" | "subscriber_count";

function ChannelsLeaderboard({ channels }: { channels: OverviewChannel[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const sorted = [...channels].sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number;
    const bv = (b[sortKey] ?? 0) as number;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold">Channels</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
            <tr>
              <th className="px-4 py-2">Channel</th>
              <Sortable k="subscriber_count" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Subs
              </Sortable>
              <Sortable k="views" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Views
              </Sortable>
              <Sortable
                k="watch_time_minutes"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={clickSort}
              >
                Watch (h)
              </Sortable>
              <Sortable k="subs_net" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Net subs
              </Sortable>
              <th className="px-4 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/channels/${c.id}`}
                    className="flex items-center gap-2.5 hover:underline"
                  >
                    {c.avatar_url ? (
                      <Image
                        src={c.avatar_url}
                        alt=""
                        width={28}
                        height={28}
                        unoptimized
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--bg-2)] text-xs font-bold text-[var(--ink-2)]">
                        {(c.title || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{c.title || "Untitled"}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCount(c.subscriber_count ?? 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCount(c.views)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCount(Math.round(c.watch_time_minutes / 60))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.subs_net >= 0 ? "+" : ""}
                  {formatCount(c.subs_net)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeltaPill pct={c.views_delta_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sortable({
  k,
  sortKey,
  sortDir,
  onClick,
  children,
}: {
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-2 text-right">
      <button
        onClick={() => onClick(k)}
        className={[
          "inline-flex items-center gap-1 text-xs uppercase tracking-wide",
          active ? "text-[var(--ink-1)]" : "text-[var(--ink-2)] hover:text-[var(--ink-1)]",
        ].join(" ")}
      >
        {children}
        <span className={active ? "opacity-100" : "opacity-30"}>
          {active && sortDir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

function TopVideosCard({ videos }: { videos: OverviewTopVideo[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold">Top videos</h2>
      </div>
      {videos.length === 0 ? (
        <p className="p-5 text-sm text-[var(--ink-2)]">No video activity this period.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {videos.map((v) => (
            <li key={v.video_id} className="p-3">
              <Link
                href={`/dashboard/videos/${v.video_id}`}
                className="flex items-center gap-3 hover:bg-[var(--bg-2)] -mx-2 rounded-lg px-2 py-1.5"
              >
                {v.thumbnail_url ? (
                  <Image
                    src={v.thumbnail_url}
                    alt=""
                    width={72}
                    height={40}
                    unoptimized
                    className="h-10 w-[72px] shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-[72px] shrink-0 rounded bg-[var(--bg-2)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {v.title || v.external_video_id}
                  </div>
                  <div className="truncate text-xs text-[var(--ink-2)]">
                    {v.channel_title}
                    {v.content_type === "short" ? " · Short" : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatCount(v.views)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  const connectUrl = apiUrl(
    `/auth/google/init?next=${encodeURIComponent("/dashboard/channels")}`,
  );
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Welcome to ReUnifyd.
      </h1>
      <p className="mb-6 text-[var(--ink-2)]">
        Connect your first YouTube channel to start syncing analytics.
      </p>
      <a href={connectUrl} className="btn accent">
        Connect YouTube
      </a>
      <p className="mt-4 text-xs text-[var(--ink-2)]">
        Once you have a few days of synced data, this page will fill up with KPIs,
        per-channel trends, and your top-performing videos.
      </p>
      <p className="mt-6 text-sm">
        Already connected?{" "}
        <span className="text-[var(--accent)] underline">
          <Link href="/dashboard/channels">View channels →</Link>
        </span>{" "}
        and click <em>Sync now</em>.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-[var(--ink-2)]">
          Loading…
        </div>
      }
    >
      <OverviewInner />
    </Suspense>
  );
}
