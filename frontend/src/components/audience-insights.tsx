"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { youtube, type InsightsResponse } from "@/lib/youtube";
import { formatCount } from "@/lib/format";

const PALETTE = [
  "var(--accent)",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const DEVICE_LABEL: Record<string, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
  TV: "TV",
  GAME_CONSOLE: "Console",
  AUTOMOTIVE: "Auto",
  WEARABLE: "Wearable",
  UNKNOWN_PLATFORM: "Unknown",
};

const TRAFFIC_LABEL: Record<string, string> = {
  YT_SEARCH: "YouTube search",
  RELATED_VIDEO: "Suggested videos",
  EXT_URL: "External",
  NO_LINK_OTHER: "Direct / Other",
  NO_LINK_EMBEDDED: "Embedded",
  BROWSE: "Browse features",
  YT_CHANNEL: "Channel page",
  SUBSCRIBER: "Subscriptions",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlist",
  END_SCREEN: "End screen",
  SHORTS: "Shorts swipe",
  HASHTAGS: "Hashtags",
  ADVERTISING: "Ads",
  PROMOTED: "Promoted",
  CAMPAIGN_CARD: "Campaign card",
  ANNOTATION: "Annotation",
  YT_OTHER_PAGE: "Other YT page",
  LIVE_REDIRECT: "Live redirect",
  PRODUCT_PAGE: "Product page",
  SOUND_PAGE: "Sound page",
  VIDEO_REMIXES: "Remixes",
};

// Pretty country names — small subset; falls back to ISO code.
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
function countryLabel(code: string | null): string {
  if (!code || code === "ZZ") return "Unknown";
  try {
    return COUNTRY_NAMES.of(code) || code;
  } catch {
    return code;
  }
}

export function AudienceInsights({
  channelId,
  refreshKey,
}: {
  channelId: number;
  refreshKey?: string | number | null;
}) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    youtube
      .insights(channelId, 28)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load insights");
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, refreshKey]);

  if (error) {
    const is401 = /\b401\b/.test(error);
    const is403 = /\b403\b/.test(error);
    const title = is401
      ? "Reconnect required"
      : is403
        ? "Access denied"
        : "Audience data unavailable";
    const body = is401
      ? "Your YouTube connection has expired. Reconnect this channel to refresh audience insights."
      : is403
        ? "This Google account doesn't have analytics access for this channel."
        : "We couldn't load audience insights right now. Please try again shortly.";
    return (
      <div
        className="card flex items-start gap-3 p-5 text-sm"
        role="alert"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[var(--ink)]">{title}</div>
          <div className="mt-0.5 text-[var(--ink-2)]">{body}</div>
          {is401 ? (
            <Link
              href="/dashboard/channels"
              className="mt-2 inline-flex items-center text-[var(--brand)] hover:underline"
            >
              Manage channels →
            </Link>
          ) : null}
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>;
  }

  const hasGeo = data.geography.length > 0;
  const hasDevices = data.devices.length > 0;
  const hasTraffic = data.traffic_sources.length > 0;

  if (!hasGeo && !hasDevices && !hasTraffic) {
    return (
      <div className="card p-5 text-sm text-[var(--ink-2)]">
        No audience data yet — try Sync now or check back later.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
      <CountriesCard data={data.geography} />
      <DevicesCard data={data.devices} />
      <TrafficCard data={data.traffic_sources} />
    </div>
  );
}

function CountriesCard({
  data,
}: {
  data: Array<{ country: string | null; views: number }>;
}) {
  const total = data.reduce((s, r) => s + r.views, 0);
  return (
    <div className="card flex h-full flex-col p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Top countries
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">No data.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.slice(0, 10).map((r) => {
            const pct = total ? (r.views / total) * 100 : 0;
            return (
              <li key={r.country ?? "?"} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate pr-2">{countryLabel(r.country)}</span>
                  <span className="shrink-0 tabular-nums text-[var(--ink-2)]">
                    {formatCount(r.views)} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DevicesCard({
  data,
}: {
  data: Array<{ device: string | null; views: number }>;
}) {
  const chart = data.map((r, i) => ({
    name: DEVICE_LABEL[r.device ?? "UNKNOWN_PLATFORM"] ?? r.device ?? "Unknown",
    value: r.views,
    color: PALETTE[i % PALETTE.length],
  }));
  return (
    <div className="card flex h-full flex-col p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Devices
      </h3>
      {chart.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">No data.</p>
      ) : (
        <>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={68}
                  paddingAngle={2}
                  stroke="white"
                >
                  {chart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [formatCount(Number(v) || 0), "Views"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "white",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {chart.map((c) => (
              <li key={c.name} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="truncate">{c.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TrafficCard({
  data,
}: {
  data: Array<{ source: string | null; views: number }>;
}) {
  const sorted = [...data].sort((a, b) => b.views - a.views).slice(0, 8);
  const total = sorted.reduce((s, r) => s + r.views, 0);
  return (
    <div className="card flex h-full flex-col p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
        Traffic sources
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)]">No data.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {sorted.map((r) => {
            const pct = total ? (r.views / total) * 100 : 0;
            return (
              <li key={r.source ?? "?"} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="truncate pr-2">
                    {TRAFFIC_LABEL[r.source ?? ""] ?? r.source ?? "Unknown"}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--ink-2)]">
                    {formatCount(r.views)} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: "#8b5cf6",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
