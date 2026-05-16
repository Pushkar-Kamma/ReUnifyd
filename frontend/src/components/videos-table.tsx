"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { formatCount } from "@/lib/format";

type SortKey = "views" | "watch_time_minutes" | "ctr" | "engagement";
type SortDir = "asc" | "desc";

const COLLAPSED = 10;

export function VideosTable({
  channelId,
  refreshKey,
}: {
  channelId: number;
  refreshKey?: string | number | null;
}) {
  const [rows, setRows] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    youtube
      .videosSummary(channelId)
      .then((r) => {
        if (!cancelled) setRows(r.videos);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load videos");
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, refreshKey]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const get = (v: VideoSummary): number => {
      switch (sortKey) {
        case "views":
          return v.views ?? 0;
        case "watch_time_minutes":
          return v.watch_time_minutes ?? 0;
        case "ctr":
          return v.click_through_rate ?? 0;
        case "engagement":
          // engagement proxy = avg % viewed (we don't have per-video like/comment in this aggregate)
          return v.avg_percent_viewed ?? 0;
      }
    };
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => sign * (get(a) - get(b)));
  }, [rows, sortKey, sortDir]);

  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED);

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  if (error) {
    return (
      <div className="card p-5 text-sm text-red-600" role="alert">
        {error}
      </div>
    );
  }
  if (rows === null) {
    return <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">
        No videos synced for this channel yet.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
            <tr>
              <th className="px-4 py-3">Video</th>
              <SortHeader k="views" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Views
              </SortHeader>
              <SortHeader
                k="watch_time_minutes"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={clickSort}
              >
                Watch (h)
              </SortHeader>
              <SortHeader k="ctr" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                CTR
              </SortHeader>
              <SortHeader
                k="engagement"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={clickSort}
              >
                Avg viewed
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => {
              const ytUrl = `https://www.youtube.com/watch?v=${v.external_video_id}`;
              return (
                <tr key={v.video_id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <a
                      href={ytUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 hover:underline"
                    >
                      {v.thumbnail_url ? (
                        <Image
                          src={v.thumbnail_url}
                          alt=""
                          width={64}
                          height={36}
                          unoptimized
                          className="h-9 w-16 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-9 w-16 shrink-0 rounded bg-[var(--bg-2)]" />
                      )}
                      <span className="line-clamp-2 max-w-md">
                        {v.title || v.external_video_id}
                      </span>
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCount(v.views ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCount(Math.round((v.watch_time_minutes ?? 0) / 60))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(v.click_through_rate ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(v.avg_percent_viewed ?? 0).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > COLLAPSED ? (
        <div className="border-t border-[var(--border)] p-3 text-center">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            {showAll ? "Show top 10" : `Show all ${sorted.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SortHeader({
  k,
  sortKey,
  sortDir,
  onClick,
  children,
}: {
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3 text-right">
      <button
        onClick={() => onClick(k)}
        className={[
          "inline-flex items-center gap-1 text-xs uppercase tracking-wide",
          active ? "text-[var(--ink-1)]" : "text-[var(--ink-2)]",
        ].join(" ")}
      >
        {children}
        {active ? <span>{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}
