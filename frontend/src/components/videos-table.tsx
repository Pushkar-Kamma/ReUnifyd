"use client";

import { VideoThumbnail } from "@/components/video-thumbnail";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { youtube, type VideoSummary } from "@/lib/youtube";
import { groups } from "@/lib/groups";
import { formatCount, relativeTime } from "@/lib/format";
import { downloadCsv, downloadJson } from "@/lib/export";
import { useToast } from "@/components/toast";
import { TableRowSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";

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
// avdLabel kept for future Avg-view column re-add; reference once so lint stays quiet.
void avdLabel;

export function VideosTable({
  channelId,
  refreshKey,
}: {
  channelId: number;
  refreshKey?: string | number | null;
}) {
  const [rows, setRows] = useState<VideoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => {
    const sk = searchParams.get("vsort");
    const sd = searchParams.get("vdir");
    const tf = searchParams.get("vtype");
    const q = searchParams.get("vq") ?? "";
    return {
      sortKey: (["published_at", "views", "likes", "comments"] as const).includes(sk as SortKey) ? (sk as SortKey) : "views",
      sortDir: (sd === "asc" ? "asc" : "desc") as SortDir,
      typeFilter: (["all", "short", "long"] as const).includes(tf as "all" | "short" | "long") ? (tf as "all" | "short" | "long") : "all",
      search: q,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initial.sortDir);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupsList, setGroupsList] = useState<Array<{ id: number; name: string }> | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [search, setSearch] = useState(initial.search);
  const [typeFilter, setTypeFilter] = useState<"all" | "short" | "long">(initial.typeFilter);
  const { toast } = useToast();

  // Sync filter/sort/search state to URL (replace, not push, to avoid history spam).
  useEffect(() => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    const setOrDel = (k: string, v: string, def: string) => {
      if (v && v !== def) sp.set(k, v);
      else sp.delete(k);
    };
    setOrDel("vsort", sortKey, "views");
    setOrDel("vdir", sortDir, "desc");
    setOrDel("vtype", typeFilter, "all");
    setOrDel("vq", search, "");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir, typeFilter, search]);

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
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((v) => {
      if (typeFilter === "short" && v.content_type !== "short") return false;
      if (typeFilter === "long" && v.content_type === "short") return false;
      if (needle && !(v.title || "").toLowerCase().includes(needle)) return false;
      return true;
    });
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
    return [...filtered].sort((a, b) => sign * (get(a) - get(b)));
  }, [rows, sortKey, sortDir, search, typeFilter]);

  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED);

  // Compute anomaly badges within the same content-type cohort (shorts vs long)
  // using median + MAD (robust to outliers).
  const anomalies = useMemo(() => {
    const map = new Map<number, { kind: "spike" | "underperform"; ratio: number }>();
    if (!rows || rows.length < 5) return map;
    const cohorts: Record<"short" | "long", VideoSummary[]> = { short: [], long: [] };
    for (const v of rows) {
      (v.content_type === "short" ? cohorts.short : cohorts.long).push(v);
    }
    for (const cohort of Object.values(cohorts)) {
      if (cohort.length < 5) continue;
      const views = cohort.map((v) => v.views ?? 0).sort((a, b) => a - b);
      const median = views[Math.floor(views.length / 2)];
      if (median <= 0) continue;
      const deviations = views.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
      const mad = deviations[Math.floor(deviations.length / 2)] || median * 0.2;
      const spikeThresh = median + 2.5 * mad;
      for (const v of cohort) {
        const x = v.views ?? 0;
        if (x >= spikeThresh && x >= median * 1.5) {
          map.set(v.video_id, { kind: "spike", ratio: x / median });
        } else if (x > 0 && x <= median * 0.3 && cohort.length >= 8) {
          map.set(v.video_id, { kind: "underperform", ratio: x / median });
        }
      }
    }
    return map;
  }, [rows]);

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function handleOpenGroupModal() {
    setGroupsLoading(true);
    setGroupsError(null);
    groups
      .list()
      .then((r) => {
        if (r.ok) {
          setGroupsList(r.groups.map((g) => ({ id: g.id, name: g.name })));
        }
      })
      .catch((e) => {
        setGroupsError(e instanceof Error ? e.message : "Failed to load groups");
      })
      .finally(() => setGroupsLoading(false));
    setShowGroupModal(true);
  }

  async function handleAddToGroup(groupId: number) {
    const videoIds = Array.from(selected);
    if (videoIds.length === 0) return;
    setAddingToGroup(true);
    try {
      const r = await groups.addItemsBatch(groupId, videoIds);
      setSelected(new Set());
      setShowGroupModal(false);
      const addedCount = r.added.length;
      const skippedCount = r.skipped.length;
      const msg = skippedCount > 0
        ? `Added ${addedCount} — ${skippedCount} already in group`
        : `Added ${addedCount} video${addedCount === 1 ? "" : "s"} to group`;
      toast(msg, "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add videos to group";
      setGroupsError(msg);
      toast(msg, "error");
    } finally {
      setAddingToGroup(false);
    }
  }

  function handleSelectAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((v) => v.video_id)));
    }
  }

  function handleToggleVideo(videoId: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelected(newSelected);
  }

  // Close modal on Escape key
  useEffect(() => {
    if (!showGroupModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowGroupModal(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGroupModal]);

  if (error) {
    return (
      <div className="card p-5 text-sm text-red-600" role="alert">
        {error}
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={6} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="🎬"
        title="No videos yet"
        description="Sync this channel to pull in its videos and analytics."
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Search & filter toolbar */}
      <div className="border-b border-[var(--border)] px-4 py-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search videos by title…"
          className="flex-1 min-w-[200px] rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        />
        <div className="flex gap-1">
          {(["all", "long", "short"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                typeFilter === t
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-2)] hover:bg-[var(--bg-1)] text-[var(--ink-2)]"
              }`}
            >
              {t === "all" ? "All" : t === "long" ? "Long" : "Shorts"}
            </button>
          ))}
        </div>
        {rows && (
          <span className="text-xs text-[var(--ink-2)] ml-auto">
            {sorted.length} of {rows.length}
          </span>
        )}
        <div className="flex gap-1">
          <button
            onClick={() => {
              const exportRows = sorted.map((v) => ({
                title: v.title || v.external_video_id,
                video_id: v.external_video_id,
                published_at: v.published_at || "",
                content_type: v.content_type || "",
                views: v.views ?? 0,
                likes: v.likes ?? 0,
                comments: v.comments ?? 0,
                engagement_rate_pct: engagementRate(v).toFixed(2),
              }));
              downloadCsv(`videos-channel-${channelId}.csv`, exportRows);
              toast(`Exported ${exportRows.length} rows to CSV`, "success");
            }}
            className="text-xs rounded border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 hover:bg-[var(--bg-2)]"
            title="Download visible rows as CSV"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => {
              downloadJson(`videos-channel-${channelId}.json`, sorted);
              toast(`Exported ${sorted.length} rows to JSON`, "success");
            }}
            className="text-xs rounded border border-[var(--border)] bg-[var(--bg-1)] px-2 py-1.5 hover:bg-[var(--bg-2)]"
            title="Download visible rows as JSON"
          >
            ↓ JSON
          </button>
        </div>
      </div>

      {/* Batch action toolbar */}
      {selected.size > 0 && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-2)] px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-[var(--ink-2)]">
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:underline"
          >
            Clear
          </button>
          <button
            onClick={handleOpenGroupModal}
            disabled={addingToGroup}
            className="ml-auto btn-sm"
            style={{ opacity: addingToGroup ? 0.6 : 1 }}
          >
            {addingToGroup ? "Adding…" : "Add to group"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)] shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-3 py-3 w-12">
                <input
                  type="checkbox"
                  checked={selected.size === visible.length && visible.length > 0}
                  onChange={handleSelectAll}
                  className="cursor-pointer"
                />
              </th>
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
              const detailHref = `/dashboard/videos/${v.video_id}`;
              const isShort = v.content_type === "short";
              return (
                <tr key={v.video_id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(v.video_id)}
                      onChange={() => handleToggleVideo(v.video_id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={detailHref}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <VideoThumbnail
                          src={v.thumbnail_url}
                          width={64}
                          height={36}
                          className="h-9 w-16 shrink-0 rounded object-cover"
                        />
                      <span className="line-clamp-2 max-w-md">
                        {v.title || v.external_video_id}
                      </span>
                      {(() => {
                        const a = anomalies.get(v.video_id);
                        if (!a) return null;
                        if (a.kind === "spike") {
                          return (
                            <span
                              className="ml-1 shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700"
                              title={`Outperforming cohort by ${a.ratio.toFixed(1)}× the median`}
                            >
                              🔥 Spike
                            </span>
                          );
                        }
                        return (
                          <span
                            className="ml-1 shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700"
                            title={`Underperforming — ${(a.ratio * 100).toFixed(0)}% of the median`}
                          >
                            📉 Low
                          </span>
                        );
                      })()}
                      {isShort ? (
                        <span className="ml-1 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Short
                        </span>
                      ) : v.duration_seconds ? (
                        <span className="ml-1 shrink-0 text-xs text-[var(--ink-2)]">
                          {durationLabel(v.duration_seconds)}
                        </span>
                      ) : null}
                      <a
                        href={ytUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto shrink-0 text-xs text-[var(--ink-2)] hover:text-[var(--accent)] hover:underline"
                        title="Open on YouTube"
                      >
                        ↗
                      </a>
                    </Link>
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

      {/* Group selection modal */}
      {showGroupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGroupModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-modal-title"
        >
          <div className="card max-h-80 w-96 overflow-y-auto p-5">
            <h3 id="group-modal-title" className="mb-4 text-lg font-semibold">Add to group</h3>
            {groupsError && (
              <div className="mb-3 rounded bg-red-100 p-2 text-sm text-red-700">
                {groupsError}
              </div>
            )}
            {groupsLoading && (
              <div className="text-sm text-[var(--ink-2)]">Loading groups…</div>
            )}
            {groupsList && groupsList.length === 0 && (
              <div className="text-sm text-[var(--ink-2)]">No groups yet. Create one first.</div>
            )}
            {groupsList && groupsList.length > 0 && (
              <div className="space-y-2">
                {groupsList.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => void handleAddToGroup(g.id)}
                    disabled={addingToGroup}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-sm text-left hover:bg-[var(--bg-2)] disabled:opacity-50"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowGroupModal(false)}
                className="ml-auto btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
