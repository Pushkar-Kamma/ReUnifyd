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
import { youtube, type Channel, type DailyMetric, type VideoSummary } from "@/lib/youtube";
import { ApiError } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";
import { VideosTable } from "@/components/videos-table";
import { VideoTimeline } from "@/components/video-timeline";
import { AudienceInsights } from "@/components/audience-insights";
import { ContentTypeBreakdown } from "@/components/content-type-breakdown";
import { ChannelHealthScore } from "@/components/channel-health-score";
import { PostTimeHeatmap } from "@/components/post-time-heatmap";
import { ChannelGoals } from "@/components/channel-goals";
import { TitlePatternInsights } from "@/components/title-pattern-insights";
import { PlatformBadge } from "@/components/platform-badge";
import { platformOf } from "@/lib/platform";
import { useDashboardMode } from "@/lib/dashboard-mode";

const DAYS = 28;

type SyncStatusKind = "success" | "info" | "error" | "auth";
type SyncStatus = { kind: SyncStatusKind; text: string };

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
  const { isAdvanced } = useDashboardMode();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [series, setSeries] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [metric, setMetric] = useState<MetricKey>("views");
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");

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
    setSyncStatus(null);
    try {
      const r = await youtube.syncDaily(id, 30);
      try {
        await youtube.syncFull(id, 180);
      } catch {
        // ignore — videos will populate on next sync
      }
      if (r.skipped) {
        setSyncStatus({ kind: "info", text: `Sync skipped. ${r.reason ?? "Recently synced"}.` });
      } else {
        setSyncStatus({ kind: "success", text: `Sync complete. Refreshed ${r.inserted_rows ?? 0} day${(r.inserted_rows ?? 0) === 1 ? "" : "s"} of data.` });
      }
      await load();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        setSyncStatus({ kind: "auth", text: "Your YouTube connection has expired. Reconnect this channel to sync again." });
      } else if (status === 403) {
        setSyncStatus({ kind: "error", text: "This Google account doesn't have analytics access for this channel." });
      } else if (status === 429) {
        setSyncStatus({ kind: "info", text: "Too many sync requests. Please wait a moment and try again." });
      } else {
        setSyncStatus({ kind: "error", text: "Sync failed. Please try again shortly." });
      }
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

  // 30-day projection via linear regression on the selected metric.
  const projection = useMemo(() => {
    if (series.length < 7) return null;
    const ys = series.map((r) => METRICS[metric].pick(r));
    const n = ys.length;
    const xs = Array.from({ length: n }, (_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    const intercept = meanY - slope * meanX;
    let total30 = 0;
    for (let i = n; i < n + 30; i++) total30 += Math.max(0, intercept + slope * i);
    const recentAvg = ys.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, n);
    const earlyAvg = ys.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, n);
    const trend = earlyAvg === 0 ? 0 : ((recentAvg - earlyAvg) / earlyAvg) * 100;
    return { total30, trend };
  }, [series, metric]);

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
        <p className="mt-4 text-[var(--danger)]">{error ?? "Channel not found."}</p>
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
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-3xl font-bold tracking-tight">
              {channel.title || "Untitled channel"}
            </h1>
            <PlatformBadge platform={platformOf(channel)} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-2)]">
            {channel.custom_url ? <span>{channel.custom_url}</span> : null}
            <span>· {formatCount(channel.subscriber_count)} subscribers</span>
            <span>· synced {relativeTime(channel.last_synced_at)}</span>
          </div>
        </div>
        <button onClick={onSync} disabled={syncing} className="btn accent">
          {syncing ? "Syncing" : "Sync now"}
        </button>
      </header>

      {syncStatus ? <SyncBanner status={syncStatus} onDismiss={() => setSyncStatus(null)} /> : null}

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

      <div className="mb-8">
        {isAdvanced ? <ChannelHealthScore channelId={id} series={series} /> : null}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold">
            Daily {METRICS[metric].label.toLowerCase()}
          </h3>
          {hasData && projection && isAdvanced ? (
            <span
              className="text-xs text-[var(--ink-2)]"
              title={`Linear extrapolation from last ${series.length} days. Recent 7d vs first 7d trend: ${projection.trend >= 0 ? "+" : ""}${projection.trend.toFixed(0)}%`}
            >
              Projected next 30d: <span className="font-semibold text-[var(--ink-1)]">{METRICS[metric].format(projection.total30)}</span>
              <span className={projection.trend >= 0 ? "ml-2 text-[var(--ok)]" : "ml-2 text-[var(--danger)]"}>
                {projection.trend >= 0 ? "↗" : "↘"} {projection.trend >= 0 ? "+" : ""}{projection.trend.toFixed(0)}%
              </span>
            </span>
          ) : null}
          {!hasData ? (
            <span className="text-xs text-[var(--ink-2)]">
              No data yet. Use Sync now.
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
                    background: "var(--bg)",
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

      {isAdvanced ? (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Audience
          </h2>
          <AudienceInsights channelId={id} refreshKey={channel.last_synced_at ?? ""} />

          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Content mix
          </h2>
          <ContentTypeBreakdown channelId={id} refreshKey={channel.last_synced_at ?? ""} />

          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Upload schedule
          </h2>
          <PostTimeHeatmap channelId={id} />

          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Title patterns
          </h2>
          <TitlePatternInsights channelId={id} />

          <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Goals
          </h2>
          <ChannelGoals
            channelId={id}
            currentSubscribers={channel.subscriber_count ?? 0}
            currentViews30d={totals.views}
          />
        </>
      ) : null}

      <h2 className="mt-10 mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Videos
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5 normal-case">
          <button
            onClick={() => setViewMode("table")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "table"
                ? "bg-[var(--contrast)] text-[var(--on-contrast)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "timeline"
                ? "bg-[var(--contrast)] text-[var(--on-contrast)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"
            }`}
          >
            Timeline
          </button>
        </div>
      </h2>
      {viewMode === "table" ? (
        <VideosTable channelId={id} refreshKey={channel.last_synced_at ?? ""} />
      ) : (
        <VideoTimelineWrapper channelId={id} refreshKey={channel.last_synced_at ?? ""} />
      )}
    </section>
  );
}

function VideoTimelineWrapper({
  channelId,
  refreshKey,
}: {
  channelId: number;
  refreshKey?: string | number | null;
}) {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVideos(null);
    setError(null);
    youtube
      .videosSummary(channelId)
      .then((r) => {
        if (!cancelled) setVideos(r.videos);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load videos");
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, refreshKey]);

  if (error) {
    return (
      <div className="card p-5 text-sm text-red-600" role="alert">
        {error}
      </div>
    );
  }
  if (videos === null) {
    return <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>;
  }
  return <VideoTimeline videos={videos} />;
}

function SyncBanner({
  status,
  onDismiss,
}: {
  status: SyncStatus;
  onDismiss: () => void;
}) {
  const styles: Record<SyncStatusKind, { bg: string; icon: string; iconBg: string; iconColor: string; title: string }> = {
    success: { bg: "rgba(34,197,94,0.06)", icon: "✓", iconBg: "rgb(220,252,231)", iconColor: "rgb(22,163,74)", title: "Synced" },
    info: { bg: "rgba(120,120,120,0.08)", icon: "i", iconBg: "rgb(229,231,235)", iconColor: "rgb(75,85,99)", title: "Info" },
    error: { bg: "rgba(239,68,68,0.06)", icon: "!", iconBg: "rgb(254,226,226)", iconColor: "rgb(220,38,38)", title: "Sync failed" },
    auth: { bg: "rgba(245,158,11,0.06)", icon: "↻", iconBg: "rgb(254,243,199)", iconColor: "rgb(217,119,6)", title: "Reconnect required" },
  };
  const s = styles[status.kind];
  return (
    <div
      role={status.kind === "error" || status.kind === "auth" ? "alert" : "status"}
      aria-live="polite"
      className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--border)] p-3 text-sm"
      style={{ background: s.bg }}
    >
      <div
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: s.iconBg, color: s.iconColor }}
      >
        {s.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[var(--ink)]">{s.title}</div>
        <div className="mt-0.5 text-[var(--ink-2)]">{status.text}</div>
        {status.kind === "auth" ? (
          <Link
            href="/dashboard/channels"
            className="mt-2 inline-flex items-center text-[var(--accent)] hover:underline"
          >
            Manage channels →
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-2 text-[var(--ink-2)] hover:text-[var(--ink)]"
      >
        ✕
      </button>
    </div>
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
