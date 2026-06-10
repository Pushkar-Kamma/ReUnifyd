"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { VideoThumbnail } from "@/components/video-thumbnail";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  groups,
  videos as videosApi,
  type ContentGroupDetail,
  type ContentGroupItem,
  type Video,
} from "@/lib/groups";
import { youtube, type Channel } from "@/lib/youtube";
import { ApiError } from "@/lib/api";
import { formatCount } from "@/lib/format";

type Metric = "views" | "watch_time_minutes" | "engagement";
type Period = 0 | 30 | 90;

const PERIOD_LABELS: Record<Period, string> = {
  0: "Lifetime",
  30: "Last 30 days",
  90: "Last 90 days",
};

const ACCENT_COLORS = [
  "var(--accent)",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#f87171",
  "#38bdf8",
  "#fb923c",
  "#e879f9",
];

function engagementRate(item: ContentGroupItem): number {
  if (!item.views) return 0;
  return ((item.likes + item.comments + item.shares) / item.views) * 100;
}

function AwardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block text-[var(--warn)]"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [groupMeta, setGroupMeta] = useState<ContentGroupDetail | null>(null);
  const [items, setItems] = useState<ContentGroupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(0);
  const [metric, setMetric] = useState<Metric>("views");
  const [showAdd, setShowAdd] = useState(false);

  // Rename state
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (p: Period = period) => {
      setError(null);
      try {
        const r = await groups.get(id, p);
        setGroupMeta(r.group);
        setItems(r.items);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("Group not found.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load group.");
        }
      } finally {
        setLoading(false);
      }
    },
    [id, period],
  );

  useEffect(() => {
    setLoading(true);
    void load(period);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onRemoveItem(itemId: number) {
    try {
      await groups.removeItem(id, itemId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function onSaveName() {
    const name = draftName.trim();
    if (!name || !groupMeta) return;
    setSaving(true);
    try {
      await groups.update(id, { name });
      setGroupMeta({ ...groupMeta, name });
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  // Find winner (most views in the selected period)
  const winner = useMemo(
    () =>
      items.length === 0
        ? null
        : items.reduce((best, cur) => (cur.views > best.views ? cur : best)),
    [items],
  );

  const chartData = useMemo(
    () =>
      items.map((it) => ({
        label: it.channel_title?.slice(0, 16) ?? `#${it.channel_id}`,
        value:
          metric === "views"
            ? it.views
            : metric === "watch_time_minutes"
              ? Math.round(it.watch_time_minutes / 60)
              : Number(engagementRate(it).toFixed(2)),
        item_id: it.item_id,
      })),
    [items, metric],
  );

  const metricLabel =
    metric === "views"
      ? "Views"
      : metric === "watch_time_minutes"
        ? "Watch (h)"
        : "Engagement (%)";

  if (loading) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <p className="text-[var(--ink-2)]">Loading…</p>
      </section>
    );
  }
  if (error || !groupMeta) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <Link href="/dashboard/groups" className="text-sm text-[var(--accent)]">
          ← All groups
        </Link>
        <p className="mt-4 text-[var(--danger)]">{error ?? "Group not found."}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-8">
      {/* Back */}
      <Link href="/dashboard/groups" className="text-sm text-[var(--accent)]">
        ← All groups
      </Link>

      {/* Header row */}
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSaveName();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="input-field w-80 text-xl font-semibold"
              />
              <button
                onClick={() => void onSaveName()}
                disabled={saving || !draftName.trim()}
                className="btn accent text-sm"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-[var(--ink-2)] hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{groupMeta.name}</h1>
              <button
                onClick={() => {
                  setDraftName(groupMeta.name);
                  setEditing(true);
                }}
                className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
                title="Rename group"
              >
                ✎
              </button>
            </div>
          )}
          {groupMeta.description ? (
            <p className="mt-1 text-sm text-[var(--ink-2)]">{groupMeta.description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex gap-0.5 rounded-lg border border-[var(--border)] p-0.5 text-xs">
            {([0, 30, 90] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={[
                  "rounded px-3 py-1.5 transition",
                  period === p
                    ? "bg-[var(--accent)] font-medium text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--bg-2)]",
                ].join(" ")}
              >
                {p === 0 ? "Lifetime" : `${p}d`}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} className="btn accent text-sm">
            + Add video
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="mb-1 text-lg font-semibold">No videos in this group</h2>
          <p className="mb-4 text-sm text-[var(--ink-2)]">
            Add 2+ videos that represent the same content across channels to compare them.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn accent">
            Add a video
          </button>
        </div>
      ) : (
        <>
          {/* Winner banner */}
          {winner && items.length > 1 ? (
            <WinnerBanner winner={winner} period={period} metric={metric} />
          ) : null}

          {/* Comparison cards */}
          <div
            className={[
              "mb-6 grid gap-3",
              items.length <= 2
                ? "grid-cols-1 sm:grid-cols-2"
                : items.length <= 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : "grid-cols-2 sm:grid-cols-4",
            ].join(" ")}
          >
            {items.map((item, idx) => (
              <ComparisonCard
                key={item.item_id}
                item={item}
                isWinner={winner?.item_id === item.item_id && items.length > 1}
                color={ACCENT_COLORS[idx % ACCENT_COLORS.length]}
                metric={metric}
                period={period}
                onRemove={() => void onRemoveItem(item.item_id)}
              />
            ))}
          </div>

          {/* Head-to-head A/B comparison (only for exactly 2 items) */}
          {items.length === 2 ? <HeadToHead a={items[0]} b={items[1]} /> : null}

          {/* Chart + metric picker */}
          <div className="card mb-6 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {PERIOD_LABELS[period]} — {metricLabel}
              </h2>
              <div className="flex gap-0.5 rounded-lg border border-[var(--border)] p-0.5 text-xs">
                {(["views", "watch_time_minutes", "engagement"] as Metric[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={[
                      "rounded px-3 py-1.5 transition",
                      metric === m
                        ? "bg-[var(--accent)] font-medium text-white"
                        : "text-[var(--ink-2)] hover:bg-[var(--bg-2)]",
                    ].join(" ")}
                  >
                    {m === "views" ? "Views" : m === "watch_time_minutes" ? "Watch (h)" : "Eng. %"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(12,18,28,0.07)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    stroke="var(--ink-3)"
                    tickFormatter={(v) =>
                      metric === "engagement" ? `${v}%` : formatCount(Number(v))
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    tick={{ fontSize: 11 }}
                    stroke="var(--ink-3)"
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(12,18,28,0.04)" }}
                    formatter={(v) => [
                      metric === "engagement"
                        ? `${v}%`
                        : formatCount(Number(v)),
                      metricLabel,
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {chartData.map((d, idx) => (
                      <Cell
                        key={d.item_id}
                        fill={ACCENT_COLORS[idx % ACCENT_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
                <tr>
                  <th className="px-4 py-3">Video</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">Watch (h)</th>
                  <th className="px-4 py-3 text-right">Eng. %</th>
                  <th className="px-4 py-3 text-right">Lifetime views</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isWin = winner?.item_id === it.item_id && items.length > 1;
                  return (
                    <tr
                      key={it.item_id}
                      className={[
                        "border-t border-[var(--border)]",
                        isWin ? "bg-[var(--warn-soft)]" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <VideoThumbnail
                            src={it.thumbnail_url}
                            width={64}
                            height={36}
                            className="h-9 w-16 shrink-0 rounded object-cover"
                          />
                          <span className="line-clamp-2 max-w-xs">
                            {it.title || it.external_video_id}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-2)]">
                        {it.channel_title ?? `#${it.channel_id}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {isWin ? <AwardIcon size={13} /> : null}{isWin ? " " : ""}{formatCount(it.views)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCount(Math.round(it.watch_time_minutes / 60))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {engagementRate(it).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ink-2)]">
                        {formatCount(it.lifetime_views)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => void onRemoveItem(it.item_id)}
                          className="text-xs text-[var(--ink-3)] hover:text-[var(--danger)] hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd ? (
        <AddVideoModal
          groupId={id}
          existingVideoIds={new Set(items.map((i) => i.video_id))}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      ) : null}
    </section>
  );
}

// ---------- Winner banner ----------
function WinnerBanner({
  winner,
  period,
  metric,
}: {
  winner: ContentGroupItem;
  period: Period;
  metric: Metric;
}) {
  const value =
    metric === "views"
      ? formatCount(winner.views)
      : metric === "watch_time_minutes"
        ? `${formatCount(Math.round(winner.watch_time_minutes / 60))}h`
        : `${engagementRate(winner).toFixed(2)}%`;
  const metricWord =
    metric === "views" ? "views" : metric === "watch_time_minutes" ? "watch time" : "engagement";
  const periodWord = period === 0 ? "lifetime" : `last ${period} days`;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-5 py-3">
      <AwardIcon size={22} />
      <div>
        <span className="font-semibold">
          {winner.channel_title ?? `Channel #${winner.channel_id}`}
        </span>{" "}
        leads with{" "}
        <span className="font-semibold">{value}</span>{" "}
        {metricWord} ({periodWord})
      </div>
    </div>
  );
}

// ---------- Comparison card ----------
function ComparisonCard({
  item: it,
  isWinner,
  color,
  metric,
  period,
  onRemove,
}: {
  item: ContentGroupItem;
  isWinner: boolean;
  color: string;
  metric: Metric;
  period: Period;
  onRemove: () => void;
}) {
  const value =
    metric === "views"
      ? it.views
      : metric === "watch_time_minutes"
        ? Math.round(it.watch_time_minutes / 60)
        : null;
  const displayValue =
    metric === "engagement"
      ? `${engagementRate(it).toFixed(2)}%`
      : formatCount(value ?? 0);
  const subLabel =
    metric === "views"
      ? "views"
      : metric === "watch_time_minutes"
        ? "watch hours"
        : "engagement";

  return (
    <div
      className={[
        "card relative flex flex-col gap-3 overflow-hidden p-4",
        isWinner ? "ring-2 ring-[var(--warn)]" : "",
      ].join(" ")}
    >
      {/* Color stripe */}
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: color }} />

      {isWinner ? (
        <span className="absolute right-3 top-3"><AwardIcon size={16} /></span>
      ) : null}

      {/* Thumbnail */}
      <VideoThumbnail
        src={it.thumbnail_url}
        width={320}
        height={180}
        className="w-full rounded-lg object-cover"
      />

      {/* Channel */}
      <div className="text-xs font-medium text-[var(--ink-2)]">
        {it.channel_title ?? `Channel #${it.channel_id}`}
      </div>

      {/* Video title */}
      <div className="line-clamp-2 text-sm font-medium leading-snug">
        {it.title || it.external_video_id}
      </div>

      {/* Big metric */}
      <div>
        <div className="text-2xl font-bold tabular-nums" style={{ color }}>
          {displayValue}
        </div>
        <div className="text-xs text-[var(--ink-2)]">
          {PERIOD_LABELS[period]} {subLabel}
        </div>
      </div>

      {/* Subscribers */}
      {it.subscriber_count != null ? (
        <div className="text-xs text-[var(--ink-2)]">
          {formatCount(it.subscriber_count)} subscribers
        </div>
      ) : null}

      <button
        onClick={onRemove}
        className="mt-auto self-end text-xs text-[var(--ink-3)] hover:text-[var(--danger)] hover:underline"
      >
        Remove
      </button>
    </div>
  );
}

// ---------- Add Video Modal ----------
function AddVideoModal({
  groupId,
  existingVideoIds,
  onClose,
  onAdded,
}: {
  groupId: number;
  existingVideoIds: Set<number>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [vids, setVids] = useState<Video[]>([]);
  const [loadingVids, setLoadingVids] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    youtube
      .channels()
      .then((r) => {
        setChannels(r.channels);
        if (r.channels.length === 1) setSelectedChannel(r.channels[0].id);
      })
      .catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    if (selectedChannel == null) return;
    setLoadingVids(true);
    setVids([]);
    setSearch("");
    videosApi
      .byChannel(selectedChannel)
      .then((r) => setVids(r.videos))
      .catch(() => setVids([]))
      .finally(() => setLoadingVids(false));
  }, [selectedChannel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vids;
    const q = search.toLowerCase();
    return vids.filter((v) => (v.title ?? v.external_video_id).toLowerCase().includes(q));
  }, [vids, search]);

  async function add(v: Video) {
    setAdding(v.id);
    try {
      await groups.addItem(groupId, v.id);
      await onAdded();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Add failed");
      setAdding(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl bg-[var(--bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add a video</h2>
          <button onClick={onClose} className="text-sm text-[var(--ink-2)] hover:underline">
            Close
          </button>
        </div>

        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Channel</label>
            <select
              className="input-field"
              value={selectedChannel ?? ""}
              onChange={(e) => setSelectedChannel(Number(e.target.value) || null)}
            >
              <option value="" disabled>
                Pick a channel…
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.external_channel_id}
                </option>
              ))}
            </select>
          </div>
          {selectedChannel != null && vids.length > 0 ? (
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Search</label>
              <input
                type="search"
                placeholder="Filter videos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field"
              />
            </div>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border)]">
          {loadingVids ? (
            <p className="p-4 text-sm text-[var(--ink-2)]">Loading…</p>
          ) : selectedChannel == null ? (
            <p className="p-4 text-sm text-[var(--ink-2)]">Pick a channel to see its videos.</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-[var(--ink-2)]">
              {vids.length === 0
                ? "No videos synced for this channel yet."
                : "No videos match your search."}
            </p>
          ) : (
            <ul>
              {filtered.map((v) => {
                const already = existingVideoIds.has(v.id);
                return (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <VideoThumbnail
                        src={v.thumbnail_url}
                        width={64}
                        height={36}
                        className="h-9 w-16 shrink-0 rounded object-cover"
                      />
                      <span className="truncate text-sm">
                        {v.title || v.external_video_id}
                      </span>
                    </div>
                    <button
                      onClick={() => void add(v)}
                      disabled={already || adding === v.id}
                      className="btn shrink-0 text-xs"
                    >
                      {already ? "Added" : adding === v.id ? "Adding…" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


function HeadToHead({ a, b }: { a: ContentGroupItem; b: ContentGroupItem }) {
  const rate = (it: ContentGroupItem) => engagementRate(it);
  const rows: Array<{
    label: string;
    aVal: number;
    bVal: number;
    fmt: (n: number) => string;
  }> = [
    { label: "Views", aVal: a.views, bVal: b.views, fmt: (n) => formatCount(n) },
    { label: "Likes", aVal: a.likes, bVal: b.likes, fmt: (n) => formatCount(n) },
    { label: "Comments", aVal: a.comments, bVal: b.comments, fmt: (n) => formatCount(n) },
    {
      label: "Watch (h)",
      aVal: (a.watch_time_minutes ?? 0) / 60,
      bVal: (b.watch_time_minutes ?? 0) / 60,
      fmt: (n) => n.toFixed(1),
    },
    {
      label: "Engagement %",
      aVal: rate(a),
      bVal: rate(b),
      fmt: (n) => `${n.toFixed(2)}%`,
    },
  ];

  return (
    <div className="card mb-6 p-5">
      <h2 className="mb-1 text-base font-semibold">Head-to-head</h2>
      <p className="mb-4 text-xs text-[var(--ink-2)]">
        Side-by-side delta between the two videos in this group.
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <div className="truncate font-semibold text-right" title={a.title || undefined}>
          {a.title || "Video A"}
        </div>
        <div className="text-center text-xs uppercase tracking-wide text-[var(--ink-3)]">
          vs
        </div>
        <div className="truncate font-semibold" title={b.title || undefined}>
          {b.title || "Video B"}
        </div>
        {rows.map((r) => {
          const winner: "a" | "b" | "tie" =
            r.aVal > r.bVal ? "a" : r.bVal > r.aVal ? "b" : "tie";
          const max = Math.max(r.aVal, r.bVal) || 1;
          const delta =
            Math.max(r.aVal, r.bVal) === 0
              ? 0
              : ((Math.abs(r.aVal - r.bVal) / Math.max(r.aVal, r.bVal)) * 100);
          return (
            <FragmentRow
              key={r.label}
              label={r.label}
              aVal={r.fmt(r.aVal)}
              bVal={r.fmt(r.bVal)}
              aBarPct={(r.aVal / max) * 100}
              bBarPct={(r.bVal / max) * 100}
              winner={winner}
              delta={delta}
            />
          );
        })}
      </div>
    </div>
  );
}

function FragmentRow({
  label,
  aVal,
  bVal,
  aBarPct,
  bBarPct,
  winner,
  delta,
}: {
  label: string;
  aVal: string;
  bVal: string;
  aBarPct: number;
  bBarPct: number;
  winner: "a" | "b" | "tie";
  delta: number;
}) {
  return (
    <>
      <div className="text-right">
        <div className={`tabular-nums ${winner === "a" ? "font-semibold text-[var(--ink-1)]" : "text-[var(--ink-2)]"}`}>
          {aVal}
        </div>
        <div className="ml-auto mt-1 h-1.5 max-w-[140px] overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div
            className={`ml-auto h-full ${winner === "a" ? "bg-[var(--accent)]" : "bg-[var(--ink-3)]"}`}
            style={{ width: `${aBarPct}%`, marginLeft: "auto" }}
          />
        </div>
      </div>
      <div className="px-2 text-center text-xs text-[var(--ink-2)]">
        <div>{label}</div>
        {winner !== "tie" && delta > 0 ? (
          <div className="mt-0.5 text-[10px] text-[var(--ok)]">
            {winner === "a" ? "←" : "→"} +{delta.toFixed(0)}%
          </div>
        ) : null}
      </div>
      <div>
        <div className={`tabular-nums ${winner === "b" ? "font-semibold text-[var(--ink-1)]" : "text-[var(--ink-2)]"}`}>
          {bVal}
        </div>
        <div className="mt-1 h-1.5 max-w-[140px] overflow-hidden rounded-full bg-[var(--bg-2)]">
          <div
            className={`h-full ${winner === "b" ? "bg-[var(--accent)]" : "bg-[var(--ink-3)]"}`}
            style={{ width: `${bBarPct}%` }}
          />
        </div>
      </div>
    </>
  );
}
