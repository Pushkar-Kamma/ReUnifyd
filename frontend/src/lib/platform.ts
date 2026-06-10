/**
 * Multi-platform groundwork.
 *
 * Today the app syncs YouTube only, but the data model and UI are built to be
 * platform-aware so Instagram and TikTok can slot into the same views without a
 * rewrite. This module is the single source of truth for:
 *   - which platforms exist and their launch status,
 *   - their brand color (used only as a series/badge accent),
 *   - a normalized metric vocabulary so each platform maps onto shared concepts.
 */

export type PlatformId = "youtube" | "instagram" | "tiktok";
export type PlatformStatus = "live" | "soon";

export type PlatformDef = {
  id: PlatformId;
  label: string;
  status: PlatformStatus;
  /** Accent color for badges and chart series. */
  color: string;
  /** Platform-native names for the shared metric concepts. */
  vocab: {
    views: string;
    watchTime: string;
    followers: string;
  };
};

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    status: "live",
    color: "#e0322e",
    vocab: { views: "Views", watchTime: "Watch time", followers: "Subscribers" },
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    status: "soon",
    color: "#c13584",
    vocab: { views: "Plays", watchTime: "View time", followers: "Followers" },
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    status: "soon",
    color: "#00b8c4",
    vocab: { views: "Views", watchTime: "Watch time", followers: "Followers" },
  },
};

export const PLATFORM_LIST: PlatformDef[] = Object.values(PLATFORMS);

/**
 * Resolve a platform id for a record. The API does not yet return a platform
 * field, so everything is YouTube for now. Centralizing this means we only
 * change one place when the backend starts sending it.
 */
export function platformOf(record?: Record<string, unknown> | null): PlatformId {
  const raw = record?.["platform"];
  if (raw === "instagram" || raw === "tiktok" || raw === "youtube") return raw;
  return "youtube";
}

/** Shared, platform-neutral labels used when nothing platform-specific applies. */
export const SHARED_VOCAB = {
  views: "Views",
  watchTime: "Watch time",
  followers: "Followers",
} as const;
