"use client";

import { useEffect, useMemo, useState } from "react";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { formatCount } from "@/lib/format";

type Bucket = {
  label: string;
  count: number;
  views: number;
  color: string;
};

export function ContentTypeBreakdown({
  channelId,
  refreshKey,
}: {
  channelId: number;
  refreshKey?: string | number | null;
}) {
  const [rows, setRows] = useState<VideoSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    youtube
      .videosSummary(channelId)
      .then((r) => {
        if (!cancelled) setRows(r.videos);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, refreshKey]);

  const buckets: Bucket[] = useMemo(() => {
    const list = rows ?? [];
    const shorts = list.filter((v) => v.content_type === "short");
    const longs = list.filter((v) => v.content_type !== "short");
    const sum = (s: VideoSummary[], pick: (v: VideoSummary) => number) =>
      s.reduce((acc, v) => acc + pick(v), 0);

    return [
      {
        label: "Shorts",
        count: shorts.length,
        views: sum(shorts, (v) => v.views ?? 0),
        color: "#ef4444",
      },
      {
        label: "Long-form",
        count: longs.length,
        views: sum(longs, (v) => v.views ?? 0),
        color: "var(--accent)",
      },
    ];
  }, [rows]);

  if (rows === null) {
    return <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>;
  }
  if (rows.length === 0) {
    return null;
  }

  const totalViews = buckets.reduce((s, b) => s + b.views, 0);

  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Content type
      </h3>

      {/* Stacked bar */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        {buckets.map((b) => {
          const pct = totalViews ? (b.views / totalViews) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={b.label}
              className="h-full"
              style={{ width: `${pct}%`, background: b.color }}
              title={`${b.label}: ${formatCount(b.views)} views`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        {buckets.map((b) => {
          const pct = totalViews ? (b.views / totalViews) * 100 : 0;
          return (
            <div key={b.label}>
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: b.color }}
                />
                <span className="font-semibold">{b.label}</span>
              </div>
              <div className="text-xs text-[var(--ink-2)]">
                {b.count} video{b.count === 1 ? "" : "s"} ·{" "}
                {formatCount(b.views)} views ({pct.toFixed(1)}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
