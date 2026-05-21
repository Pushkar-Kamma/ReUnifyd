"use client";

import { useEffect, useMemo, useState } from "react";
import { youtube } from "@/lib/youtube";

/**
 * Inline SVG sparkline of the channel's daily views over the last `days` days.
 * Fetches independently per channel to keep the parent list simple.
 */
export function ChannelSparkline({
  channelId,
  days = 28,
  width = 120,
  height = 32,
}: {
  channelId: number;
  days?: number;
  width?: number;
  height?: number;
}) {
  const [values, setValues] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    youtube
      .timeseries(channelId, days)
      .then((r) => {
        if (cancelled) return;
        setValues(r.series.map((d) => d.views ?? 0));
      })
      .catch(() => {
        if (!cancelled) setValues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, days]);

  const path = useMemo(() => {
    if (!values || values.length < 2) return null;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1);
    const pts = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return [x, y] as const;
    });
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
    const area = `${d} L${width},${height} L0,${height} Z`;
    return { d, area };
  }, [values, width, height]);

  if (values === null) {
    return (
      <div
        className="animate-pulse rounded bg-[var(--bg-2)]"
        style={{ width, height }}
        aria-hidden
      />
    );
  }

  if (!path) {
    return (
      <div
        className="grid place-items-center text-[10px] text-[var(--ink-3)]"
        style={{ width, height }}
      >
        no data
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="views trend"
    >
      <path d={path.area} fill="var(--accent)" fillOpacity={0.12} />
      <path
        d={path.d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
