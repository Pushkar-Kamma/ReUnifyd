"use client";

import Link from "next/link";
import Image from "next/image";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { VideoThumbnail } from "@/components/video-thumbnail";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { groups, videos as videosApi, type ContentGroupItem, type Video } from "@/lib/groups";
import { youtube, type Channel } from "@/lib/youtube";
import { ApiError } from "@/lib/api";
import { formatCount } from "@/lib/format";

type Metric = "views" | "watch_time_minutes" | "engagement";

function engagementRate(item: ContentGroupItem): number {
  if (!item.views) return 0;
  return ((item.likes + item.comments + item.shares) / item.views) * 100;
}

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const id = Number(idStr);

  const [group, setGroup] = useState<{
    name: string;
    description: string | null;
  } | null>(null);
  const [items, setItems] = useState<ContentGroupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("views");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await groups.get(id);
      setGroup({ name: r.group.name, description: r.group.description });
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
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRemoveItem(itemId: number) {
    try {
      await groups.removeItem(id, itemId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Remove failed");
    }
  }

  const chartData = useMemo(
    () =>
      items.map((it) => ({
        label: it.channel_title?.slice(0, 18) ?? `#${it.channel_id}`,
        views: it.views,
        watch_time_minutes: it.watch_time_minutes,
        engagement: Number(engagementRate(it).toFixed(2)),
      })),
    [items],
  );

  const metricLabel = metric === "views"
    ? "Views"
    : metric === "watch_time_minutes"
      ? "Watch time (min)"
      : "Engagement rate (%)";

  if (loading) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <p className="text-[var(--ink-2)]">Loading…</p>
      </section>
    );
  }
  if (error || !group) {
    return (
      <section className="mx-auto w-[min(1120px,92vw)] py-10">
        <Link href="/dashboard/groups" className="text-sm text-[var(--accent)]">
          ← All groups
        </Link>
        <p className="mt-4 text-red-600">{error ?? "Group not found."}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <Link href="/dashboard/groups" className="text-sm text-[var(--accent)]">
        ← All groups
      </Link>
      <header className="mt-3 mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
          {group.description ? (
            <p className="mt-1 text-[var(--ink-2)]">{group.description}</p>
          ) : null}
        </div>
        <button onClick={() => setShowAdd(true)} className="btn primary">
          Add video
        </button>
      </header>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="mb-1 text-lg font-semibold">No videos in this group</h2>
          <p className="mb-4 text-sm text-[var(--ink-2)]">
            Add 2+ videos that represent the same content across channels to
            compare them.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn primary">
            Add a video
          </button>
        </div>
      ) : (
        <>
          {/* Comparison chart */}
          <div className="card mb-6 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Comparison</h2>
              <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1 text-xs">
                <MetricBtn active={metric === "views"} onClick={() => setMetric("views")}>
                  Views
                </MetricBtn>
                <MetricBtn
                  active={metric === "watch_time_minutes"}
                  onClick={() => setMetric("watch_time_minutes")}
                >
                  Watch time
                </MetricBtn>
                <MetricBtn
                  active={metric === "engagement"}
                  onClick={() => setMetric("engagement")}
                >
                  Engagement %
                </MetricBtn>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--ink-2)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      metric === "engagement" ? `${v}%` : formatCount(Number(v))
                    }
                    stroke="var(--ink-2)"
                  />
                  <Tooltip
                    formatter={(v) =>
                      metric === "engagement"
                        ? [`${v}%`, "Engagement"]
                        : [formatCount(Number(v)), metricLabel]
                    }
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "white",
                    }}
                  />
                  <Bar dataKey={metric} fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-video table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
                <tr>
                  <th className="px-4 py-3">Video</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">Watch (h)</th>
                  <th className="px-4 py-3 text-right">Eng. %</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.item_id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {it.thumbnail_url ? (
                          <VideoThumbnail
                            src={it.thumbnail_url}
                            width={64}
                            height={36}
                            className="h-9 w-16 rounded object-cover"
                          />
                        ) : (
                          <div className="h-9 w-16 rounded bg-[var(--bg-2)]" />
                        )}
                        <span className="line-clamp-2 max-w-xs">
                          {it.title || it.external_video_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-2)]">
                      {it.channel_title ?? `#${it.channel_id}`}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCount(it.views)}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCount(Math.round(it.watch_time_minutes / 60))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {engagementRate(it).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onRemoveItem(it.item_id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
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

function MetricBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded px-3 py-1 transition",
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--ink-2)] hover:bg-[var(--bg-2)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

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
    videosApi
      .byChannel(selectedChannel)
      .then((r) => setVids(r.videos))
      .catch(() => setVids([]))
      .finally(() => setLoadingVids(false));
  }, [selectedChannel]);

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
        className="card w-full max-w-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add a video</h2>
          <button
            onClick={onClose}
            className="text-sm text-[var(--ink-2)] hover:underline"
          >
            Close
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium">Channel</span>
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
        </label>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-[var(--border)]">
          {loadingVids ? (
            <p className="p-4 text-sm text-[var(--ink-2)]">Loading…</p>
          ) : selectedChannel == null ? (
            <p className="p-4 text-sm text-[var(--ink-2)]">
              Pick a channel to see its videos.
            </p>
          ) : vids.length === 0 ? (
            <div className="p-4 text-sm text-[var(--ink-2)]">
              No videos synced for this channel yet. Open the channel and click
              &ldquo;Sync now&rdquo;.
            </div>
          ) : (
            <ul>
              {vids.map((v) => {
                const already = existingVideoIds.has(v.id);
                return (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {v.thumbnail_url ? (
                        <VideoThumbnail
                          src={v.thumbnail_url}
                          width={64}
                          height={36}
                          className="h-9 w-16 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-9 w-16 shrink-0 rounded bg-[var(--bg-2)]" />
                      )}
                      <span className="truncate text-sm">
                        {v.title || v.external_video_id}
                      </span>
                    </div>
                    <button
                      onClick={() => add(v)}
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
