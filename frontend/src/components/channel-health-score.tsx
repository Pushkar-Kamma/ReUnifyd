"use client";

import { useEffect, useMemo, useState } from "react";
import { youtube, type DailyMetric, type VideoSummary } from "@/lib/youtube";

type Props = {
  channelId: number;
  series: DailyMetric[];
};

type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

function letterGrade(score: number): { grade: Grade; color: string } {
  if (score >= 92) return { grade: "A+", color: "text-emerald-600" };
  if (score >= 85) return { grade: "A", color: "text-emerald-600" };
  if (score >= 70) return { grade: "B", color: "text-lime-600" };
  if (score >= 55) return { grade: "C", color: "text-amber-600" };
  if (score >= 40) return { grade: "D", color: "text-orange-600" };
  return { grade: "F", color: "text-red-600" };
}

/**
 * Composite health score (0-100) from three pillars (0-100 each):
 *  - Consistency: regularity of uploads in the recent window
 *  - Growth:      trend of views in the daily series
 *  - Engagement:  median (likes+comments)/views across recent videos
 */
export function ChannelHealthScore({ channelId, series }: Props) {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    youtube
      .videosSummary(channelId, { limit: 50 })
      .then((r) => {
        if (!cancelled) setVideos(r.videos);
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const score = useMemo(() => {
    // --- Consistency: based on gap variance between most recent uploads
    let consistency = 0;
    if (videos && videos.length >= 3) {
      const dates = videos
        .map((v) => (v.published_at ? Date.parse(v.published_at) : 0))
        .filter((t) => t > 0)
        .sort((a, b) => b - a)
        .slice(0, 12);
      if (dates.length >= 3) {
        const gapsDays: number[] = [];
        for (let i = 0; i < dates.length - 1; i++) {
          gapsDays.push((dates[i] - dates[i + 1]) / 86_400_000);
        }
        const mean = gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length;
        const variance =
          gapsDays.reduce((a, b) => a + (b - mean) ** 2, 0) / gapsDays.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
        // CV near 0 -> very regular. CV >= 1 -> erratic.
        const regularity = Math.max(0, Math.min(1, 1 - cv));
        // Recent activity: penalise if no upload in 30+ days
        const daysSinceLast = nowMs > 0 ? (nowMs - dates[0]) / 86_400_000 : 0;
        const recency = Math.max(0, Math.min(1, 1 - daysSinceLast / 60));
        consistency = (regularity * 0.6 + recency * 0.4) * 100;
      }
    }

    // --- Growth: linear regression slope on daily views, normalized.
    let growth = 50;
    if (series.length >= 7) {
      const ys = series.map((r) => r.views ?? 0);
      const n = ys.length;
      const meanX = (n - 1) / 2;
      const meanY = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - meanX) * (ys[i] - meanY);
        den += (i - meanX) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      // Relative slope per day vs mean
      const rel = meanY > 0 ? slope / meanY : 0;
      // rel of +2%/day -> ~100, -2%/day -> ~0
      growth = Math.max(0, Math.min(100, 50 + rel * 2500));
    }

    // --- Engagement: median engagement-rate across last 20 videos
    let engagement = 0;
    if (videos && videos.length > 0) {
      const rates = videos
        .filter((v) => (v.views ?? 0) > 0)
        .map((v) =>
          (((v.likes ?? 0) + (v.comments ?? 0)) / (v.views ?? 1)) * 100,
        )
        .sort((a, b) => a - b);
      if (rates.length > 0) {
        const median = rates[Math.floor(rates.length / 2)];
        // 5%+ is excellent, 1% mediocre, 0.2% poor
        engagement = Math.max(0, Math.min(100, (median / 5) * 100));
      }
    }

    const total = consistency * 0.3 + growth * 0.4 + engagement * 0.3;
    return {
      total: Math.round(total),
      consistency: Math.round(consistency),
      growth: Math.round(growth),
      engagement: Math.round(engagement),
    };
  }, [series, videos, nowMs]);

  if (videos === null) {
    return (
      <div className="card p-5">
        <div className="text-xs uppercase tracking-wide text-[var(--ink-2)]">
          Channel health
        </div>
        <div className="mt-2 text-sm text-[var(--ink-2)]">Calculating…</div>
      </div>
    );
  }

  const { grade, color } = letterGrade(score.total);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--ink-2)]">
            Channel health
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-4xl font-bold ${color}`}>{grade}</span>
            <span className="text-sm text-[var(--ink-2)]">{score.total} / 100</span>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-xs">
        <Bar label="Consistency" value={score.consistency} hint="Upload regularity & recency" />
        <Bar label="Growth" value={score.growth} hint="Views trend over the period" />
        <Bar label="Engagement" value={score.engagement} hint="Median likes+comments per view" />
      </div>
    </div>
  );
}

function Bar({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div title={hint}>
      <div className="flex items-center justify-between">
        <span className="text-[var(--ink-2)]">{label}</span>
        <span className="tabular-nums text-[var(--ink-1)]">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
