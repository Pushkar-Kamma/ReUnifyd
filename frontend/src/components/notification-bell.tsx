"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { youtube, type Channel, type VideoSummary } from "@/lib/youtube";
import { formatCount, relativeTime } from "@/lib/format";

type Notice =
  | {
      kind: "spike";
      id: string;
      channelId: number;
      videoId: number;
      title: string;
      views: number;
      ratio: number;
      ts: number;
    }
  | {
      kind: "goal";
      id: string;
      channelId: number;
      label: string;
      metric: "subscribers" | "views_30d";
      target: number;
      current: number;
    };

type StoredGoal = {
  id: string;
  channelId: number;
  metric: "subscribers" | "views_30d";
  target: number;
  deadline: string;
};

const GOALS_KEY = "reunifyd:goals";
const SEEN_KEY = "reunifyd:notifications:seen";

function loadGoals(): StoredGoal[] {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredGoal[]) : [];
  } catch {
    return [];
  }
}

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch {}
}

function detectAnomalies(channelId: number, videos: VideoSummary[]) {
  const out: Array<{ video: VideoSummary; ratio: number }> = [];
  const cohorts: Record<"short" | "long", VideoSummary[]> = { short: [], long: [] };
  for (const v of videos) {
    (v.content_type === "short" ? cohorts.short : cohorts.long).push(v);
  }
  for (const cohort of Object.values(cohorts)) {
    if (cohort.length < 5) continue;
    const sorted = cohort.map((v) => v.views ?? 0).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= 0) continue;
    const devs = sorted.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)] || median * 0.2;
    const thresh = median + 2.5 * mad;
    for (const v of cohort) {
      const x = v.views ?? 0;
      if (x >= thresh && x >= median * 1.5) {
        out.push({ video: v, ratio: x / median });
      }
    }
  }
  void channelId;
  return out;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeen(loadSeen());
    let cancelled = false;

    async function load() {
      try {
        const r = await youtube.channels();
        if (cancelled) return;
        const channels: Channel[] = r.channels;
        const collected: Notice[] = [];
        const goals = loadGoals();

        // Per-channel: anomalies on recent videos, plus 30-day view totals for goals
        const perChannel = await Promise.all(
          channels.map(async (c) => {
            try {
              const [vs, ts] = await Promise.all([
                youtube.videosSummary(c.id, { limit: 50 }),
                youtube.timeseries(c.id, 30),
              ]);
              return { c, videos: vs.videos, views30: ts.series.reduce((a, b) => a + (b.views ?? 0), 0) };
            } catch {
              return { c, videos: [] as VideoSummary[], views30: 0 };
            }
          }),
        );
        if (cancelled) return;

        const nowMs = Date.now();
        for (const { c, videos, views30 } of perChannel) {
          // Spikes: only flag videos published in last 14 days
          const recentCutoff = nowMs - 14 * 86_400_000;
          const fresh = videos.filter(
            (v) => v.published_at && Date.parse(v.published_at) >= recentCutoff,
          );
          if (fresh.length > 0) {
            const cohort = detectAnomalies(c.id, videos).filter((a) =>
              fresh.some((f) => f.video_id === a.video.video_id),
            );
            for (const a of cohort) {
              collected.push({
                kind: "spike",
                id: `spike:${c.id}:${a.video.video_id}`,
                channelId: c.id,
                videoId: a.video.video_id,
                title: a.video.title || a.video.external_video_id,
                views: a.video.views ?? 0,
                ratio: a.ratio,
                ts: a.video.published_at ? Date.parse(a.video.published_at) : nowMs,
              });
            }
          }

          // Goal completions
          for (const g of goals) {
            if (g.channelId !== c.id) continue;
            const cur = g.metric === "subscribers" ? c.subscriber_count ?? 0 : views30;
            if (cur >= g.target) {
              collected.push({
                kind: "goal",
                id: `goal:${g.id}`,
                channelId: c.id,
                label: `${c.title || "Channel"} hit ${formatCount(g.target)} ${g.metric === "subscribers" ? "subscribers" : "views (30d)"}`,
                metric: g.metric,
                target: g.target,
                current: cur,
              });
            }
          }
        }

        // Newest spikes first; goals after
        collected.sort((a, b) => {
          if (a.kind === b.kind) {
            if (a.kind === "spike" && b.kind === "spike") return b.ts - a.ts;
            return 0;
          }
          return a.kind === "spike" ? -1 : 1;
        });
        setNotices(collected.slice(0, 25));
      } catch {}
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = useMemo(
    () => notices.filter((n) => !seen.has(n.id)).length,
    [notices, seen],
  );

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  function markAllRead() {
    const next = new Set(seen);
    for (const n of notices) next.add(n.id);
    setSeen(next);
    saveSeen(next);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn relative"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        🔔
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {notices.length > 0 ? (
              <button
                onClick={markAllRead}
                className="text-xs text-[var(--ink-2)] hover:text-[var(--accent)]"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {notices.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--ink-2)]">
                You&apos;re all caught up.
              </li>
            ) : (
              notices.map((n) => {
                const isUnread = !seen.has(n.id);
                const href =
                  n.kind === "spike"
                    ? `/dashboard/channels/${n.channelId}`
                    : `/dashboard/channels/${n.channelId}`;
                return (
                  <li
                    key={n.id}
                    className={`border-b border-[var(--border)] last:border-b-0 ${isUnread ? "bg-[var(--bg-3)]" : ""}`}
                  >
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm hover:bg-[var(--bg-2)]"
                    >
                      {n.kind === "spike" ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span>🔥</span>
                            <span className="font-semibold">Trending video</span>
                            {isUnread ? (
                              <span className="ml-auto h-2 w-2 rounded-full bg-[var(--accent)]" />
                            ) : null}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[var(--ink-1)]">
                            {n.title}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--ink-2)]">
                            {formatCount(n.views)} views · {n.ratio.toFixed(1)}× cohort median ·{" "}
                            {relativeTime(new Date(n.ts).toISOString())}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span>🎯</span>
                            <span className="font-semibold">Goal reached</span>
                            {isUnread ? (
                              <span className="ml-auto h-2 w-2 rounded-full bg-[var(--accent)]" />
                            ) : null}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[var(--ink-1)]">
                            {n.label}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--ink-2)]">
                            Current: {formatCount(n.current)}
                          </div>
                        </>
                      )}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
