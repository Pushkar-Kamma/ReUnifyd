"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { VideoThumbnail } from "@/components/video-thumbnail";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { youtube, type VideoDailySeriesRow, type VideoDetail } from "@/lib/youtube";
import { ApiError } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [series, setSeries] = useState<VideoDailySeriesRow[]>([]);
  const [lifetime, setLifetime] = useState<{
    views: number | null;
    likes: number | null;
    comments: number | null;
  } | null>(null);
  const [retention, setRetention] = useState<
    Array<{ t: number; ratio: number; relative: number | null }> | null
  >(null);
  const [retentionAvailable, setRetentionAvailable] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await youtube.video(id);
      setVideo(r.video);
      setSeries(r.series);
      setLifetime(r.lifetime);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Video not found.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load video.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadRetention = useCallback(async () => {
    try {
      const r = await youtube.videoRetention(id);
      setRetention(r.points);
      setRetentionAvailable(r.available);
    } catch {
      setRetention([]);
      setRetentionAvailable(false);
    }
  }, [id]);

  // Auto-sync on first visit if data is stale or missing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
      // Trigger background sync if we landed here without recent data
      try {
        await youtube.syncVideo(id, false);
        if (!cancelled) await load();
      } catch {
        // ignore — render whatever's in DB
      }
      if (!cancelled) await loadRetention();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, load, loadRetention]);

  async function onForceSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await youtube.syncVideo(id, true);
      setSyncMsg(`Synced ${r.inserted_rows ?? 0} day(s).`);
      await load();
      await loadRetention();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const totals = useMemo(() => {
    let views = 0;
    let watchMin = 0;
    let likes = 0;
    let comments = 0;
    let avgDur = 0;
    let avgPct = 0;
    let n = 0;
    for (const r of series) {
      views += r.views ?? 0;
      watchMin += r.watch_time_minutes ?? 0;
      likes += r.likes ?? 0;
      comments += r.comments ?? 0;
      avgDur += r.avg_view_duration_seconds ?? 0;
      avgPct += r.avg_percent_viewed ?? 0;
      n += 1;
    }
    return {
      views,
      watchHours: watchMin / 60,
      likes,
      comments,
      avgDur: n ? avgDur / n : 0,
      avgPct: n ? avgPct / n : 0,
    };
  }, [series]);

  // Fresh = published less than 7 days ago. Date.now() during render is
  // intentional here (it doesn't break SSR for client components like ours).
  let isFresh = false;
  if (video?.published_at) {
    const d = new Date(video.published_at);
    if (!Number.isNaN(d.getTime())) {
      // eslint-disable-next-line react-hooks/purity
      isFresh = Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
    }
  }

  if (loading) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <p className="text-[var(--ink-2)]">Loading…</p>
      </section>
    );
  }
  if (error || !video) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <Link href="/dashboard/channels" className="text-sm text-[var(--accent)]">
          ← Channels
        </Link>
        <p className="mt-4 text-[var(--danger)]">{error ?? "Video not found."}</p>
      </section>
    );
  }

  const ytUrl = `https://www.youtube.com/watch?v=${video.external_video_id}`;
  const hasDaily = series.length > 0;

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <Link
        href={`/dashboard/channels/${video.channel_id}`}
        className="text-sm text-[var(--accent)]"
      >
        ← {video.channel_title ?? "Channel"}
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        {video.thumbnail_url ? (
          <VideoThumbnail
            src={video.thumbnail_url}
            width={240}
            height={135}
            className="aspect-video w-60 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="aspect-video w-60 shrink-0 rounded-lg bg-[var(--bg-2)]" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-snug tracking-tight">
            {video.title || video.external_video_id}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ink-2)]">
            <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Open on YouTube ↗
            </a>
            <span>· published {relativeTime(video.published_at)}</span>
            <span>· last sync {relativeTime(video.last_synced_at)}</span>
          </div>
        </div>
        <button onClick={onForceSync} disabled={syncing} className="btn">
          {syncing ? "Syncing…" : "Refresh"}
        </button>
      </header>

      {syncMsg ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-3 text-sm"
          style={{ background: "var(--accent-soft)" }}
        >
          {syncMsg}
        </div>
      ) : null}

      {isFresh ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--ink-2)]"
          style={{ background: "rgba(245,158,11,0.08)" }}
        >
          ⏳ This video was just published. YouTube Analytics takes 24-48 hours
          to process viewer data — lifetime stats below are live, but watch time
          and engagement metrics will fill in tomorrow.
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Lifetime
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi
          label="Views"
          value={lifetime?.views != null ? formatCount(lifetime.views) : "—"}
          sub={isFresh ? undefined : `${formatCount(totals.views)} via Analytics`}
        />
        <Kpi
          label="Likes"
          value={lifetime?.likes != null ? formatCount(lifetime.likes) : "—"}
          sub={isFresh ? undefined : `${formatCount(totals.likes)} via Analytics`}
        />
        <Kpi
          label="Comments"
          value={lifetime?.comments != null ? formatCount(lifetime.comments) : "—"}
          sub={isFresh ? undefined : `${formatCount(totals.comments)} via Analytics`}
        />
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Last 180 days
        <span
          title="Numbers come from the YouTube Analytics API which has a 24-48h processing delay."
          className="cursor-help text-[var(--ink-2)]/70"
        >
          ⓘ
        </span>
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Watch (h)" value={formatCount(Math.round(totals.watchHours))} />
        <Kpi label="Avg view" value={formatSeconds(totals.avgDur)} />
        <Kpi label="Avg viewed" value={`${totals.avgPct.toFixed(1)}%`} />
      </div>

      {/* Daily views chart */}
      <div className="card mb-6 p-5">
        <h3 className="mb-3 text-base font-semibold">Daily views</h3>
        {hasDaily ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                    background: "var(--bg)",
                  }}
                />
                <Line type="monotone" dataKey="views" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid h-40 place-items-center text-sm text-[var(--ink-2)]">
            No daily data yet. Use Refresh.
          </div>
        )}
      </div>

      {/* Retention curve */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Audience retention</h3>
          <span className="text-xs text-[var(--ink-2)]">
            % still watching at each point in the video
          </span>
        </div>
        {retention === null ? (
          <div className="grid h-40 place-items-center text-sm text-[var(--ink-2)]">
            Loading…
          </div>
        ) : !retentionAvailable || retention.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-[var(--ink-2)]">
            Not enough views yet for retention data.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={retention.map((p) => ({
                  t: Math.round(p.t * 100),
                  pct: Math.round(p.ratio * 100),
                }))}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(t) => `${t}%`}
                  stroke="var(--ink-2)"
                  label={{
                    value: "Video progress",
                    position: "insideBottom",
                    offset: -2,
                    style: { fontSize: 11, fill: "var(--ink-2)" },
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  stroke="var(--ink-2)"
                  domain={[0, "auto"]}
                />
                <Tooltip
                  formatter={(v) => [`${v}%`, "Watching"]}
                  labelFormatter={(t) => `At ${t}% of video`}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#22c55e"
                  fill="rgba(34,197,94,0.15)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-3">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 text-lg font-bold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-[var(--ink-2)]">{sub}</div> : null}
    </div>
  );
}

function formatSeconds(s: number): string {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
