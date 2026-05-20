import { api } from "./api";

export type ContentGroupSummary = {
  id: number;
  name: string;
  description: string | null;
  item_count: number;
  total_views: number;
  created_at: string;
  updated_at: string;
};

export type ContentGroupItem = {
  item_id: number;
  note: string | null;
  video_id: number;
  external_video_id: string;
  title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  channel_id: number;
  channel_title: string | null;
  channel_avatar_url: string | null;
  subscriber_count: number | null;
  // Selected period metrics (lifetime when days=0)
  views: number;
  watch_time_minutes: number;
  likes: number;
  comments: number;
  shares: number;
  // Always lifetime totals regardless of period
  lifetime_views: number;
  lifetime_watch_time_minutes: number;
  lifetime_likes: number;
  lifetime_comments: number;
  lifetime_shares: number;
  lifetime_impressions: number;
};

export type ContentGroupDetail = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Video = {
  id: number;
  external_video_id: string;
  title: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  privacy_status: string | null;
  content_type: string | null;
};

export const groups = {
  list: () =>
    api<{ ok: true; groups: ContentGroupSummary[] }>("/content-groups"),

  get: (id: number, days = 0) =>
    api<{ ok: true; days: number; group: ContentGroupDetail; items: ContentGroupItem[] }>(
      `/content-groups/${id}?days=${days}`,
    ),

  create: (data: { name: string; description?: string }) =>
    api<{ ok: true; group: ContentGroupDetail }>("/content-groups", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { name?: string; description?: string }) =>
    api<{ ok: true; group: ContentGroupDetail }>(`/content-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: number) =>
    api<void>(`/content-groups/${id}`, { method: "DELETE" }),

  addItem: (groupId: number, videoId: number, note?: string) =>
    api<{ ok: true; item: { id: number; video_id: number } }>(
      `/content-groups/${groupId}/items`,
      {
        method: "POST",
        body: JSON.stringify({ video_id: videoId, note: note ?? null }),
      },
    ),

  addItemsBatch: (groupId: number, videoIds: number[], note?: string) =>
    api<{ ok: true; added: number[]; skipped: number[] }>(
      `/content-groups/${groupId}/items/batch`,
      {
        method: "POST",
        body: JSON.stringify({ video_ids: videoIds, note: note ?? null }),
      },
    ),

  removeItem: (groupId: number, itemId: number) =>
    api<void>(`/content-groups/${groupId}/items/${itemId}`, {
      method: "DELETE",
    }),
};

export const videos = {
  byChannel: (channelId: number) =>
    api<{ ok: true; videos: Video[] }>(`/youtube/videos?channel_id=${channelId}`),
};
