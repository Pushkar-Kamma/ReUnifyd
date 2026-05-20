"use client";

import { useEffect, useMemo, useState } from "react";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { formatCount } from "@/lib/format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PostTimeHeatmap({ channelId }: { channelId: number }) {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    youtube
      .videosSummary(channelId, { limit: 500 })
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

  const { matrix, max, bestSlot } = useMemo(() => {
    const m: { sum: number; count: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ sum: 0, count: 0 })),
    );
    let mx = 0;
    let bestAvg = 0;
    let best: { day: number; hour: number; avg: number; count: number } | null = null;
    if (videos) {
      for (const v of videos) {
        if (!v.published_at) continue;
        const d = new Date(v.published_at);
        if (Number.isNaN(d.getTime())) continue;
        const day = d.getDay();
        const hour = d.getHours();
        const views = v.views ?? 0;
        const cell = m[day][hour];
        cell.sum += views;
        cell.count += 1;
      }
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          const c = m[d][h];
          if (c.count === 0) continue;
          const avg = c.sum / c.count;
          if (avg > mx) mx = avg;
          if (c.count >= 2 && avg > bestAvg) {
            bestAvg = avg;
            best = { day: d, hour: h, avg, count: c.count };
          }
        }
      }
    }
    return { matrix: m, max: mx, bestSlot: best };
  }, [videos]);

  const totalVideos = videos?.filter((v) => v.published_at).length ?? 0;

  if (videos === null) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">Loading heatmap…</div>
    );
  }

  if (totalVideos === 0) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">
        No upload times available yet.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Best time to post</h3>
          <p className="text-xs text-[var(--ink-2)]">
            Avg views by day of week and hour ({totalVideos} videos, viewer local time)
          </p>
        </div>
        {bestSlot ? (
          <p className="text-xs text-[var(--ink-2)]">
            Best slot:{" "}
            <span className="font-semibold text-[var(--ink-1)]">
              {DAYS[bestSlot.day]} {hourLabel(bestSlot.hour)}
            </span>{" "}
            — {formatCount(Math.round(bestSlot.avg))} avg views (n={bestSlot.count})
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="text-[10px]">
          <thead>
            <tr>
              <th className="px-1 py-0.5" />
              {HOURS.map((h) => (
                <th
                  key={h}
                  className="px-0.5 py-0.5 text-center font-normal text-[var(--ink-3)]"
                  style={{ minWidth: 18 }}
                >
                  {h % 6 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((dLabel, d) => (
              <tr key={d}>
                <td className="pr-2 py-0.5 text-right text-[var(--ink-2)]">{dLabel}</td>
                {HOURS.map((h) => {
                  const cell = matrix[d][h];
                  const avg = cell.count > 0 ? cell.sum / cell.count : 0;
                  const intensity = max > 0 && avg > 0 ? Math.max(0.08, avg / max) : 0;
                  const bg =
                    cell.count === 0
                      ? "var(--bg-2)"
                      : `rgba(6, 95, 212, ${intensity.toFixed(2)})`;
                  const title =
                    cell.count === 0
                      ? `${dLabel} ${hourLabel(h)}: no uploads`
                      : `${dLabel} ${hourLabel(h)}: ${formatCount(
                          Math.round(avg),
                        )} avg views across ${cell.count} upload${
                          cell.count === 1 ? "" : "s"
                        }`;
                  return (
                    <td
                      key={h}
                      className="p-0"
                      style={{ width: 18, height: 18, background: bg }}
                      title={title}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}${suffix}`;
}
