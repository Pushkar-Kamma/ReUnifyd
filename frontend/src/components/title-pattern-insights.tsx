"use client";

import { useEffect, useMemo, useState } from "react";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { formatCount } from "@/lib/format";

type Pattern = {
  key: string;
  label: string;
  test: (title: string) => boolean;
};

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}]/u;

const PATTERNS: Pattern[] = [
  { key: "question", label: "Question mark (?)", test: (t) => t.includes("?") },
  { key: "exclaim", label: "Exclamation (!)", test: (t) => t.includes("!") },
  { key: "number", label: "Starts with a number", test: (t) => /^\s*\d/.test(t) },
  { key: "emoji", label: "Contains an emoji", test: (t) => EMOJI_RE.test(t) },
  {
    key: "caps",
    label: "Has ALL-CAPS word (3+ letters)",
    test: (t) => /\b[A-Z]{3,}\b/.test(t),
  },
  { key: "colon", label: "Contains a colon (:)", test: (t) => t.includes(":") },
  { key: "long", label: "60+ characters", test: (t) => t.length >= 60 },
  { key: "short", label: "Under 30 characters", test: (t) => t.length < 30 },
];

export function TitlePatternInsights({ channelId }: { channelId: number }) {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    youtube
      .videosSummary(channelId, { limit: 200 })
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

  const { rows, medianViews, sample } = useMemo(() => {
    if (!videos || videos.length < 6) {
      return { rows: [] as Array<{ pattern: Pattern; with: number; without: number; lift: number; count: number }>, medianViews: 0, sample: videos?.length ?? 0 };
    }
    const sortedViews = videos.map((v) => v.views ?? 0).sort((a, b) => a - b);
    const median = sortedViews[Math.floor(sortedViews.length / 2)];
    const out = PATTERNS.map((pattern) => {
      const matched = videos.filter((v) => pattern.test(v.title || ""));
      const unmatched = videos.filter((v) => !pattern.test(v.title || ""));
      const meanWith = avg(matched.map((v) => v.views ?? 0));
      const meanWithout = avg(unmatched.map((v) => v.views ?? 0));
      const lift = meanWithout === 0 ? 0 : ((meanWith - meanWithout) / meanWithout) * 100;
      return {
        pattern,
        with: Math.round(meanWith),
        without: Math.round(meanWithout),
        lift,
        count: matched.length,
      };
    })
      .filter((r) => r.count >= 2 && videos.length - r.count >= 2)
      .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
    return { rows: out, medianViews: median, sample: videos.length };
  }, [videos]);

  if (videos === null) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">
        Analyzing titles…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">
        Not enough videos yet to find title patterns. Come back after more uploads.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold">Title pattern insights</h3>
        <p className="text-xs text-[var(--ink-2)]">
          Average views by title characteristic across {sample} recent videos
          (median: {formatCount(medianViews)}). Sorted by lift.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.slice(0, 6).map((r) => {
          const positive = r.lift >= 0;
          return (
            <li
              key={r.pattern.key}
              className="flex items-center justify-between gap-3 rounded border border-[var(--border)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.pattern.label}</div>
                <div className="text-xs text-[var(--ink-2)]">
                  {r.count} match{r.count === 1 ? "" : "es"} · avg{" "}
                  {formatCount(r.with)} vs {formatCount(r.without)} without
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  positive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {positive ? "+" : ""}
                {r.lift.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
