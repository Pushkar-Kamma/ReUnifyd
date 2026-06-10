"use client";

import { PLATFORMS, type PlatformId } from "@/lib/platform";

export function PlatformIcon({ platform, size = 16 }: { platform: PlatformId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (platform) {
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4a2.5 2.5 0 0 0-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7C23 15.2 23 12 23 12Zm-13 3.3V8.7l5.7 3.3L10 15.3Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.5 3c.3 2 1.5 3.5 3.5 3.8v2.6c-1.3 0-2.5-.4-3.5-1v5.9a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v2.7a3.1 3.1 0 1 0 2.2 3V3h2.7Z" />
        </svg>
      );
  }
}

/**
 * Small badge showing a channel/video's platform. Shows a "Soon" hint for
 * platforms that are not live yet.
 */
export function PlatformBadge({
  platform,
  showLabel = true,
  size = "sm",
}: {
  platform: PlatformId;
  showLabel?: boolean;
  size?: "sm" | "xs";
}) {
  const def = PLATFORMS[platform];
  const pad = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const text = size === "xs" ? "text-[10px]" : "text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] ${pad} ${text} font-medium`}
      title={def.status === "soon" ? `${def.label} support is coming soon` : def.label}
    >
      <span style={{ color: def.color }}>
        <PlatformIcon platform={platform} size={size === "xs" ? 12 : 14} />
      </span>
      {showLabel ? <span>{def.label}</span> : null}
      {def.status === "soon" ? (
        <span className="rounded-full bg-[var(--bg-2)] px-1.5 text-[10px] text-[var(--ink-3)]">
          Soon
        </span>
      ) : null}
    </span>
  );
}
