"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { formatCount, relativeTime } from "@/lib/format";

type SortKey =
  | "published_at"
  | "views"
  | "likes"
  | "comments";
type SortDir = "asc" | "desc";

const COLLAPSED = 10;

function engagementRate(v: VideoSummary): number {
  if (!v.views) return 0;
  const eng = (v.likes ?? 0) + (v.comments ?? 0);
  return (eng / v.views) * 100;
}

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}:${r.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function avdLabel(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

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
    setError(null);
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
        case "published_at":
          return v.published_at ? Date.parse(v.published_at) : 0;
        case "views":
          return v.views ?? 0;
        case "likes":
          return v.likes ?? 0;
        case "comments":
          return v.comments ?? 0;
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
              <SortHeader k="published_at" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Published
              </SortHeader>
              <SortHeader k="views" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Views
              </SortHeader>
              <SortHeader k="likes" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Likes
              </SortHeader>
              <SortHeader k="comments" sortKey={sortKey} sortDir={sortDir} onClick={clickSort}>
                Comments
              </SortHeader>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wide text-[var(--ink-2)]">
                <span
                  className="group relative inline-flex cursor-help items-center gap-1"
                  tabIndex={0}
                >
                  Eng. rate
                  <span className="text-[var(--ink-2)]/80">ⓘ</span>
                  <span className="pointer-events-none absolute right-0 top-full z-10 mt-2 hidden w-64 rounded-md border border-[var(--border)] bg-white p-2.5 text-left text-xs font-normal normal-case tracking-normal text-[var(--ink-1)] shadow-lg group-hover:block group-focus-within:block">
                    Engagement rate — industry standard.
                    <br />
                    <span className="font-mono">(likes + comments) ÷ views × 100</span>
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => {
              const ytUrl = `https://www.youtube.com/watch?v=${v.external_video_id}`;
              const isShort = v.content_type === "short";
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
                      {isShort ? (
                        <span className="ml-1 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Short
                        </span>
                      ) : v.duration_seconds ? (
                        <span className="ml-1 shrink-0 text-xs text-[var(--ink-2)]">
                          {durationLabel(v.duration_seconds)}
                        </span>
                      ) : null}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">
                    {relativeTime(v.published_at)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCount(v.views ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCount(v.likes ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {v.comments == null ? "—" : formatCount(v.comments)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {engagementRate(v).toFixed(2)}%
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
          "group inline-flex items-center gap-1 text-xs uppercase tracking-wide transition",
          active
            ? "text-[var(--ink-1)]"
            : "text-[var(--ink-2)] hover:text-[var(--ink-1)]",
        ].join(" ")}
        title={`Sort by ${typeof children === "string" ? children : ""}`}
      >
        {children}
        <span
          className={[
            "transition",
            active ? "opacity-100" : "opacity-30 group-hover:opacity-70",
          ].join(" ")}
        >
          {active && sortDir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
