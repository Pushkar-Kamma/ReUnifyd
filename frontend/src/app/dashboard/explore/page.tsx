"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDays } from "@/components/period-switcher";
import { ApiError } from "@/lib/api";
import { formatCount } from "@/lib/format";
import {
  youtube,
  type ExploreContentType,
  type ExploreDimension,
  type ExploreGroupBy,
  type ExploreMetric,
  type ExploreResponse,
  type OverviewChannel,
} from "@/lib/youtube";

type ChartType = "line" | "bar";

const METRICS: Array<{ value: ExploreMetric; label: string; videoOnly?: boolean; channelOnly?: boolean }> = [
  { value: "views", label: "Views" },
  { value: "watch_time_minutes", label: "Watch time (min)" },
  { value: "subscribers_gained", label: "Subscribers gained", channelOnly: true },
  { value: "subscribers_lost", label: "Subscribers lost", channelOnly: true },
  { value: "subscribers_net", label: "Subscribers (net)", channelOnly: true },
  { value: "estimated_revenue", label: "Est. revenue" },
  { value: "likes", label: "Likes", videoOnly: true },
  { value: "comments", label: "Comments", videoOnly: true },
  { value: "shares", label: "Shares", videoOnly: true },
];

const DIMENSIONS: Array<{ value: ExploreDimension; label: string }> = [
  { value: "time", label: "Time (day)" },
  { value: "channel", label: "Channel" },
  { value: "video", label: "Video" },
  { value: "content_type", label: "Content type (Shorts/Long)" },
];

const GROUPS: Array<{ value: ExploreGroupBy; label: string }> = [
  { value: "none", label: "None" },
  { value: "channel", label: "Channel" },
  { value: "content_type", label: "Content type" },
];

const SERIES_COLORS = [
  "#e0322e",
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
  "#f97316",
];

const SAVED_KEY = "reunifyd:explore:saved-views";

type SavedView = {
  id: string;
  name: string;
  metric: ExploreMetric;
  dimension: ExploreDimension;
  groupBy: ExploreGroupBy;
  days: number;
  channelId: number | null;
  contentType: ExploreContentType;
};

function loadSaved(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as SavedView[];
  } catch {
    return [];
  }
}
function persistSaved(views: SavedView[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_KEY, JSON.stringify(views));
}

function ExploreInner() {
  const days = useDays(28);
  const [metric, setMetric] = useState<ExploreMetric>("views");
  const [dimension, setDimension] = useState<ExploreDimension>("time");
  const [groupBy, setGroupBy] = useState<ExploreGroupBy>("channel");
  const [channelFilter, setChannelFilter] = useState<number | null>(null);
  const [contentType, setContentType] = useState<ExploreContentType>(null);
  const [chartType, setChartType] = useState<ChartType>("line");

  const [data, setData] = useState<ExploreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<OverviewChannel[]>([]);

  const [saved, setSaved] = useState<SavedView[]>([]);
  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  // Load channel list for the filter dropdown
  useEffect(() => {
    youtube
      .overview(28)
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, []);

  // If the user picks a video-only metric on a channel dimension, auto-switch dimension
  useEffect(() => {
    const m = METRICS.find((x) => x.value === metric);
    if (!m) return;
    if (m.videoOnly && !["video", "content_type"].includes(dimension)) {
      setDimension("video");
    }
    if (m.channelOnly && ["video", "content_type"].includes(dimension)) {
      setDimension("channel");
    }
  }, [metric, dimension]);

  // When grouping by channel but dimension is content_type, that's invalid → switch
  useEffect(() => {
    if (groupBy === "content_type" && !["video", "content_type"].includes(dimension)) {
      setGroupBy("none");
    }
  }, [dimension, groupBy]);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const r = await youtube.explore({
        metric,
        dimension,
        groupBy,
        days,
        channelId: channelFilter,
        contentType,
      });
      setData(r);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load (${err.status}): ${JSON.stringify(err.body)}`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load.");
      }
    }
  }, [metric, dimension, groupBy, days, channelFilter, contentType]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pivot rows → recharts data (one row per X with one column per series)
  const chartData = useMemo(() => {
    if (!data) return [];
    if (data.group_by === "none" || data.series_keys.length === 0) {
      return data.rows.map((r) => ({ x: r.x, value: r.y }));
    }
    const byX = new Map<string, Record<string, number | string>>();
    for (const r of data.rows) {
      const e = byX.get(r.x) ?? { x: r.x };
      if (r.g) e[r.g] = r.y;
      byX.set(r.x, e);
    }
    return Array.from(byX.values());
  }, [data]);

  const seriesKeys = data?.series_keys ?? [];
  const groupedMode = data?.group_by !== "none" && seriesKeys.length > 0;

  function saveCurrent() {
    const name = window.prompt(
      "Name this view",
      `${metric} by ${dimension}${groupBy !== "none" ? " · grouped by " + groupBy : ""}`,
    );
    if (!name) return;
    const v: SavedView = {
      id: crypto.randomUUID(),
      name,
      metric,
      dimension,
      groupBy,
      days,
      channelId: channelFilter,
      contentType,
    };
    const next = [...saved, v];
    setSaved(next);
    persistSaved(next);
  }

  function applySaved(v: SavedView) {
    setMetric(v.metric);
    setDimension(v.dimension);
    setGroupBy(v.groupBy);
    setChannelFilter(v.channelId);
    setContentType(v.contentType);
  }

  function removeSaved(id: string) {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    persistSaved(next);
  }

  // Metrics filtered to what's valid for the current dimension
  const availableMetrics = METRICS.filter((m) => {
    if (["video", "content_type"].includes(dimension)) return !m.channelOnly;
    return !m.videoOnly;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Advanced mode</h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            Pivot any metric by any dimension. Save useful views.
          </p>
        </div>
        <button onClick={saveCurrent} className="btn">
          💾 Save view
        </button>
      </header>

      {/* Controls */}
      <div className="card mb-5 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Metric">
            <Select value={metric} onChange={(v) => setMetric(v as ExploreMetric)}>
              {availableMetrics.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dimension (X-axis)">
            <Select value={dimension} onChange={(v) => setDimension(v as ExploreDimension)}>
              {DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Group by (series)">
            <Select value={groupBy} onChange={(v) => setGroupBy(v as ExploreGroupBy)}>
              {GROUPS.filter(
                (g) =>
                  g.value !== "content_type" ||
                  ["video", "content_type"].includes(dimension),
              ).map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chart">
            <div className="flex gap-1 rounded-md border border-[var(--border-strong)] p-1">
              {(["line", "bar"] as ChartType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChartType(t)}
                  className={[
                    "flex-1 rounded px-2 py-1 text-sm capitalize",
                    chartType === t ? "bg-[var(--bg-2)] font-semibold" : "",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Filters */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Channel">
            <Select
              value={channelFilter == null ? "" : String(channelFilter)}
              onChange={(v) => setChannelFilter(v === "" ? null : Number(v))}
            >
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Content type">
            <Select
              value={contentType ?? ""}
              onChange={(v) => setContentType((v || null) as ExploreContentType)}
            >
              <option value="">Any</option>
              <option value="short">Shorts only</option>
              <option value="video">Long-form only</option>
            </Select>
          </Field>
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-5 p-5">
        <h2 className="mb-3 text-base font-semibold">
          {METRICS.find((m) => m.value === metric)?.label} by{" "}
          {DIMENSIONS.find((d) => d.value === dimension)?.label.toLowerCase()}
        </h2>
        {error ? (
          <div className="text-sm text-[var(--danger)]">{error}</div>
        ) : !data ? (
          <div className="h-72 grid place-items-center text-sm text-[var(--ink-2)]">
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 grid place-items-center text-sm text-[var(--ink-2)]">
            No data for this slice.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                  <XAxis
                    dataKey="x"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d) => formatX(d, dimension)}
                    stroke="var(--ink-2)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatCount(v)}
                    stroke="var(--ink-2)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      fontSize: 12,
                    }}
                    formatter={(v, name) => [formatCount(Number(v) || 0), name]}
                  />
                  {groupedMode ? (
                    seriesKeys.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={metric}
                      stroke={SERIES_COLORS[0]}
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                  <XAxis
                    dataKey="x"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d) => formatX(d, dimension)}
                    stroke="var(--ink-2)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatCount(v)}
                    stroke="var(--ink-2)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      fontSize: 12,
                    }}
                    formatter={(v, name) => [formatCount(Number(v) || 0), name]}
                  />
                  {groupedMode ? (
                    seriesKeys.map((k, i) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        name={k}
                        fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))
                  ) : (
                    <Bar dataKey="value" name={metric} fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Data table */}
      {data && data.rows.length > 0 ? (
        <div className="card mb-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
                <tr>
                  <th className="px-4 py-2">
                    {DIMENSIONS.find((d) => d.value === dimension)?.label}
                  </th>
                  {data.group_by !== "none" ? <th className="px-4 py-2">Group</th> : null}
                  <th className="px-4 py-2 text-right">
                    {METRICS.find((m) => m.value === metric)?.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">{formatX(r.x, dimension)}</td>
                    {data.group_by !== "none" ? (
                      <td className="px-4 py-2">{r.g ?? "—"}</td>
                    ) : null}
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCount(r.y)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length > 100 ? (
            <div className="px-4 py-2 text-xs text-[var(--ink-2)]">
              Showing first 100 of {data.rows.length} rows.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Saved views */}
      {saved.length > 0 ? (
        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Saved views</h2>
          <ul className="divide-y divide-[var(--border)]">
            {saved.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <button
                  onClick={() => applySaved(v)}
                  className="min-w-0 flex-1 truncate text-left text-[var(--accent)] hover:underline"
                  type="button"
                >
                  {v.name}
                </button>
                <span className="shrink-0 text-xs text-[var(--ink-2)]">
                  {v.metric} · {v.dimension}
                </span>
                <button
                  onClick={() => removeSaved(v.id)}
                  className="shrink-0 text-xs text-[var(--danger)] hover:underline"
                  type="button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--ink-2)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="input-field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function formatX(x: string, dim: ExploreDimension): string {
  if (dim === "time") {
    // YYYY-MM-DD → MM-DD
    return x.slice(5);
  }
  return x;
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-[var(--ink-2)]">
          Loading…
        </div>
      }
    >
      <ExploreInner />
    </Suspense>
  );
}
