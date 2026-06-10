"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { VideoThumbnail } from "@/components/video-thumbnail";
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
import { useDashboardMode } from "@/lib/dashboard-mode";
import { ApiError, api, apiUrl } from "@/lib/api";
import { formatCount } from "@/lib/format";
import {
  youtube,
  type OverviewChannel,
  type OverviewResponse,
  type OverviewTopVideo,
} from "@/lib/youtube";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

const SERIES_COLORS = [
  "#e0322e", // brand red
  "#2563eb", // blue
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
    return <span className="text-xs text-[var(--ink-2)]">no change</span>;
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
  const { isAdvanced } = useDashboardMode();
  const days = useDays(28);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("views");
  const [selectedChannelId, setSelectedChannelId] = useState<number | "all">("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // All channels known so far (persists across channel filter switches)
  const [allChannels, setAllChannels] = useState<OverviewChannel[]>([]);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const channelParam = selectedChannelId === "all" ? undefined : selectedChannelId;
      const r = await youtube.overview(days, channelParam);
      setData(r);
      // Keep the full channel list for the dropdown (only update when unfiltered)
      if (selectedChannelId === "all" && r.channels.length > 0) {
        setAllChannels(r.channels);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load overview (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load overview.");
      }
    }
  }, [days, selectedChannelId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSyncAll() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await api<{ ok: boolean; queued: number[]; message: string }>(
        "/youtube/sync/all",
        { method: "POST" },
      );
      setSyncMsg(`Syncing ${res.queued.length} channel(s) in background. Data will update in ~1 min.`);
      // Reload after a short delay to pick up fresh data
      setTimeout(() => { void load(); setSyncMsg(null); }, 60_000);
    } catch {
      setSyncMsg("Sync failed. Check your connection.");
    } finally {
      setSyncing(false);
    }
  }

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
      <div className="mx-auto max-w-6xl p-6 text-sm text-[var(--danger)]" role="alert">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-[var(--ink-2)]">
        Loading
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
      <OnboardingChecklist />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{user?.name ? `, ${user.name}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            {selectedChannelId === "all"
              ? `Across all your channels in the last ${data.days} days.`
              : `Showing ${data.channels[0]?.title ?? "selected channel"}. Last ${data.days} days.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel filter */}
          {allChannels.length > 1 ? (
            <select
              value={selectedChannelId}
              onChange={(e) =>
                setSelectedChannelId(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            >
              <option value="all">All channels</option>
              {allChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ?? `Channel ${c.id}`}
                </option>
              ))}
            </select>
          ) : null}
          {/* Sync all button */}
          <button
            type="button"
            onClick={() => void handleSyncAll()}
            disabled={syncing}
            className="btn"
            style={{ opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? "Syncing…" : "Sync all"}
          </button>
        </div>
      </header>

      {syncMsg ? (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
          {syncMsg}
        </div>
      ) : null}

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

      {/* Quick stats cards */}
      {isAdvanced ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Lifetime views"
            value={formatCount(data.lifetime_views)}
            subtext="All-time across all videos"
          />
          <StatCard
            label="Videos"
            value={data.video_count}
            subtext={`${formatCount(data.avg_views_per_video)} avg views`}
          />
          {data.top_channel ? (
            <StatCard
              label="Top channel"
              value={data.top_channel.title || "Untitled"}
              subtext={`${formatCount(data.top_channel.views)} views (${data.days}d)`}
            />
          ) : null}
        </div>
      ) : null}

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
                  background: "var(--bg)",
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

      {/* Two-col: leaderboard + top videos (detailed mode only) */}
      {isAdvanced ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          <ChannelsLeaderboard channels={data.channels} />
          <TopVideosCard videos={data.top_videos} />
        </div>
      ) : (
        <div className="card flex items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold">Want the full picture?</h2>
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              Switch to Detailed to see the channel leaderboard, top videos,
              retention, and more.
            </p>
          </div>
          <Link href="/dashboard/channels" className="btn whitespace-nowrap">
            View channels
          </Link>
        </div>
      )}
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

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-4 py-3">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[var(--ink-3)]">{subtext}</div>
    </div>
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
  const [tab, setTab] = useState<"views" | "engagement" | "newest">("views");

  // Calculate engagement rate for each video
  const videosWithEngagement = videos.map((v) => ({
    ...v,
    engagementRate: v.views > 0 ? ((v.likes + v.comments + v.shares) / v.views) * 100 : 0,
  }));

  // Sort by different criteria
  const topByViews = [...videosWithEngagement].sort((a, b) => b.views - a.views).slice(0, 3);
  const topByEngagement = [...videosWithEngagement]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 3);
  const topNewest = [...videosWithEngagement]
    .sort((a, b) => {
      const aDate = new Date(a.published_at || 0).getTime();
      const bDate = new Date(b.published_at || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 3);

  const displayed =
    tab === "views" ? topByViews : tab === "engagement" ? topByEngagement : topNewest;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Best performers</h2>
          <div className="flex gap-0.5 rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {(["views", "engagement", "newest"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "rounded px-2.5 py-1 transition",
                  tab === t
                    ? "bg-[var(--accent)] font-medium text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--bg-2)]",
                ].join(" ")}
              >
                {t === "views" ? "Views" : t === "engagement" ? "Eng." : "New"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {displayed.length === 0 ? (
        <p className="p-5 text-sm text-[var(--ink-2)]">No video activity this period.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {displayed.map((v, idx) => (
            <li key={v.video_id} className="p-3">
              <Link
                href={`/dashboard/videos/${v.video_id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-2)] -mx-2"
              >
                <span className="shrink-0 w-5 text-center text-xs font-bold text-[var(--accent)]">
                  #{idx + 1}
                </span>
                {v.thumbnail_url ? (
                  <VideoThumbnail
                    src={v.thumbnail_url}
                    width={72}
                    height={40}
                    className="h-10 w-[72px] shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-[72px] shrink-0 rounded bg-[var(--bg-2)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {v.title || v.external_video_id}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--ink-2)]">
                    <span>{v.channel_title}</span>
                    {v.content_type === "short" && <span>· Short</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatCount(v.views)}</div>
                  <div className="text-xs text-[var(--ink-2)] tabular-nums">
                    {tab === "engagement"
                      ? `${v.engagementRate.toFixed(1)}%`
                      : tab === "newest"
                        ? new Date(v.published_at || "").toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "views"}
                  </div>
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
