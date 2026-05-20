"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDays } from "@/components/period-switcher";
import { formatCount } from "@/lib/format";
import {
  youtube,
  type InsightsResponse,
  type OverviewChannel,
  type OverviewResponse,
  type OverviewSeries,
} from "@/lib/youtube";

const SERIES_COLORS = [
  "#065fd4",
  "#c00f0c",
  "#16a34a",
  "#f59e0b",
  "#8b5cf6",
];

type Selected = OverviewChannel & { _color: string };

function CompareInner() {
  const days = useDays(28);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [normalize, setNormalize] = useState<boolean>(false);
  const [insights, setInsights] = useState<Map<number, InsightsResponse>>(new Map());

  useEffect(() => {
    youtube
      .overview(days)
      .then((r) => {
        setOverview(r);
        // Auto-select up to 3 top channels by views on first load
        setSelectedIds((prev) => {
          if (prev.size > 0) return prev;
          const top = [...r.channels]
            .sort((a, b) => b.views - a.views)
            .slice(0, 3)
            .map((c) => c.id);
          return new Set(top);
        });
      })
      .catch(() => setOverview(null));
  }, [days]);

  const selected: Selected[] = useMemo(() => {
    if (!overview) return [];
    return overview.channels
      .filter((c) => selectedIds.has(c.id))
      .map((c, i) => ({ ...c, _color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [overview, selectedIds]);

  // Fetch insights for all selected channels in parallel (not N sequential)
  useEffect(() => {
    if (selected.length === 0) return;
    const ids = selected.map((c) => c.id);
    void Promise.all(
      ids.map((id) => youtube.insights(id, 28).then((r) => ({ id, r })).catch(() => null)),
    ).then((results) => {
      setInsights((prev) => {
        const next = new Map(prev);
        for (const res of results) {
          if (res) next.set(res.id, res.r);
        }
        return next;
      });
    });
  // Only re-fetch when the set of selected channel ids changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.map((c) => c.id).join(",")]);

  const seriesBySelected: OverviewSeries[] = useMemo(() => {
    if (!overview) return [];
    return overview.series_by_channel.filter((s) => selectedIds.has(s.channel_id));
  }, [overview, selectedIds]);

  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const s of seriesBySelected) {
      const key = `ch_${s.channel_id}`;
      for (const row of s.daily) {
        const e = map.get(row.date) ?? { date: row.date };
        e[key] = row.views;
        map.set(row.date, e);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [seriesBySelected]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Compare channels</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          Pick up to 5 channels to compare. Toggle &ldquo;per 1K subs&rdquo; to
          normalize across channel sizes.
        </p>
      </header>

      {/* Channel chip picker */}
      <div className="mb-5 flex flex-wrap gap-2">
        {overview?.channels.map((c) => {
          const on = selectedIds.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                on
                  ? "border-[var(--accent)] bg-[var(--accent)]/8 font-medium text-[var(--accent)]"
                  : "border-[var(--border-strong)] hover:bg-[var(--bg-2)]",
              ].join(" ")}
            >
              {c.avatar_url ? (
                <Image
                  src={c.avatar_url}
                  alt=""
                  width={18}
                  height={18}
                  unoptimized
                  className="h-[18px] w-[18px] rounded-full object-cover"
                />
              ) : (
                <span className="h-[18px] w-[18px] rounded-full bg-[var(--bg-2)]" />
              )}
              {c.title}
              {on ? <span className="text-xs">✕</span> : <span className="text-xs">+</span>}
            </button>
          );
        })}
        {overview && overview.channels.length === 0 ? (
          <p className="text-sm text-[var(--ink-2)]">
            You haven&apos;t connected any channels yet.{" "}
            <Link href="/dashboard" className="text-[var(--accent)] hover:underline">
              Go to overview →
            </Link>
          </p>
        ) : null}
      </div>

      {selected.length < 2 ? (
        <div className="card p-8 text-center text-sm text-[var(--ink-2)]">
          Select at least 2 channels above to start comparing.
        </div>
      ) : (
        <>
          {/* Normalization toggle */}
          <div className="mb-4 flex items-center gap-2 text-sm">
            <input
              id="normalize"
              type="checkbox"
              checked={normalize}
              onChange={(e) => setNormalize(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="normalize">
              Show metrics <strong>per 1,000 subscribers</strong> (normalize by channel size)
            </label>
          </div>

          {/* KPI table — bold the winner per column */}
          <KpiTable selected={selected} normalize={normalize} />

          {/* Daily views chart */}
          <div className="card mb-5 p-5">
            <h2 className="mb-3 text-base font-semibold">Daily views</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,18,28,0.08)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(d: string) => String(d).slice(5)}
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
                      background: "white",
                      fontSize: 12,
                    }}
                  />
                  {selected.map((c) => (
                    <Line
                      key={c.id}
                      type="monotone"
                      dataKey={`ch_${c.id}`}
                      name={c.title ?? `Channel ${c.id}`}
                      stroke={c._color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {selected.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: c._color }}
                  />
                  {c.title}
                </span>
              ))}
            </div>
          </div>

          {/* Side-by-side audience cards */}
          <div className="mb-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
              Audience snapshot
            </h2>
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(selected.length, 3)}, minmax(0,1fr))`,
              }}
            >
              {selected.map((c) => (
                <AudienceMini key={c.id} channel={c} data={insights.get(c.id) ?? null} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTable({
  selected,
  normalize,
}: {
  selected: Selected[];
  normalize: boolean;
}) {
  const rows = [
    {
      label: "Subscribers",
      value: (c: Selected) => c.subscriber_count ?? 0,
      format: formatCount,
      norm: false, // can't normalize subs by subs
    },
    {
      label: "Views",
      value: (c: Selected) => c.views,
      format: formatCount,
      norm: true,
    },
    {
      label: "Watch hours",
      value: (c: Selected) => c.watch_time_minutes / 60,
      format: (v: number) => formatCount(Math.round(v)),
      norm: true,
    },
    {
      label: "Net subs",
      value: (c: Selected) => c.subs_net,
      format: (v: number) => (v >= 0 ? `+${formatCount(v)}` : formatCount(v)),
      norm: false,
    },
    {
      label: "Est. revenue ($)",
      value: (c: Selected) => c.estimated_revenue,
      format: (v: number) => `$${v.toFixed(2)}`,
      norm: true,
    },
  ];

  function getValue(row: (typeof rows)[number], c: Selected): number {
    let v = row.value(c);
    if (normalize && row.norm && c.subscriber_count && c.subscriber_count > 0) {
      v = (v / c.subscriber_count) * 1000;
    }
    return v;
  }

  return (
    <div className="card mb-5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]">
            <tr>
              <th className="px-4 py-2">Metric</th>
              {selected.map((c) => (
                <th key={c.id} className="px-4 py-2 text-right">
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ background: c._color }}
                  />
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = selected.map((c) => getValue(row, c));
              const max = Math.max(...values);
              return (
                <tr key={row.label} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium">
                    {row.label}
                    {normalize && row.norm ? (
                      <span className="ml-1 text-xs text-[var(--ink-2)]">/ 1K subs</span>
                    ) : null}
                  </td>
                  {selected.map((c, i) => {
                    const v = values[i];
                    const isWinner = v === max && v > 0 && selected.length > 1;
                    return (
                      <td
                        key={c.id}
                        className={[
                          "px-4 py-2 text-right tabular-nums",
                          isWinner ? "font-bold text-[var(--ink-1)]" : "text-[var(--ink-2)]",
                        ].join(" ")}
                      >
                        {row.format(v)}
                        {normalize && row.norm && (c.subscriber_count ?? 0) === 0 ? (
                          <span className="ml-1 text-xs text-[var(--ink-2)]">(0 subs)</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AudienceMini({ channel, data }: { channel: Selected; data: InsightsResponse | null }) {

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: channel._color }}
        />
        <h3 className="truncate text-sm font-semibold">{channel.title}</h3>
      </div>
      {data === null ? (
        <p className="text-xs text-[var(--ink-2)]">Loading…</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <MiniRow label="Top country" value={topLabel(data.geography, (r) => r.country)} />
          <MiniRow label="Top device" value={topLabel(data.devices, (r) => r.device)} />
          <MiniRow
            label="Top source"
            value={topLabel(data.traffic_sources, (r) => r.source)}
          />
        </dl>
      )}
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-xs text-[var(--ink-2)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function topLabel<T extends { views: number }>(
  items: T[],
  pick: (r: T) => string | null,
): string {
  if (!items || items.length === 0) return "—";
  const sorted = [...items].sort((a, b) => b.views - a.views);
  const top = sorted[0];
  const label = pick(top) ?? "Unknown";
  const total = sorted.reduce((s, r) => s + r.views, 0);
  const pct = total > 0 ? Math.round((top.views / total) * 100) : 0;
  return `${label} (${pct}%)`;
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-[var(--ink-2)]">
          Loading…
        </div>
      }
    >
      <CompareInner />
    </Suspense>
  );
}
