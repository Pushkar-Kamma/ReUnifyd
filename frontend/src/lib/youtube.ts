import { api } from "./api";

export type Channel = {
  id: number;
  external_channel_id: string;
  title: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  custom_url: string | null;
  description: string | null;
  country: string | null;
  language: string | null;
  subscriber_count: number | null;
  platform_account_id: number | null;
  is_active: boolean;
  published_at: string | null;
  last_synced_at: string | null;
};

export type ChannelsResponse = {
  ok: true;
  total: number;
  channels: Channel[];
};

export type DailyMetric = {
  date: string; // ISO yyyy-mm-dd
  views: number | null;
  watch_time_minutes: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  estimated_revenue: number | null;
};

export type TimeseriesResponse = {
  ok: true;
  series: DailyMetric[];
};

export const youtube = {
  channels: () => api<ChannelsResponse>("/youtube/channels"),

  channel: (id: number) =>
    api<{ ok: true; channel: Channel }>(`/youtube/channels/${id}`),

  syncDaily: (channelId: number, days: number = 30) =>
    api<{ ok: boolean; inserted_rows?: number; skipped?: boolean; reason?: string }>(
      `/youtube/sync/daily?channel_id=${channelId}&days=${days}`,
      { method: "POST" },
    ),

  syncFull: (channelId: number, days: number = 180) =>
    api<{ ok: boolean; [k: string]: unknown }>(
      `/youtube/sync/full?channel_id=${channelId}&days=${days}`,
      { method: "POST" },
    ),

  timeseries: (channelId: number, days: number = 28) =>
    api<TimeseriesResponse>(
      `/youtube/channel/timeseries?channel_id=${channelId}&days=${days}`,
    ),

  videosSummary: (channelId: number) =>
    api<{
      ok: true;
      videos: VideoSummary[];
    }>(`/youtube/videos/summary?channel_id=${channelId}`),

  insights: (channelId: number, days: number = 28) =>
    api<InsightsResponse>(
      `/youtube/channel/${channelId}/insights?days=${days}`,
    ),

  video: (videoId: number) =>
    api<{ ok: true; video: VideoDetail; series: VideoDailySeriesRow[] }>(
      `/youtube/videos/${videoId}`,
    ),

  syncVideo: (videoId: number, force = false) =>
    api<{ ok: boolean; inserted_rows?: number; skipped?: boolean; reason?: string }>(
      `/youtube/videos/${videoId}/sync${force ? "?force=true" : ""}`,
      { method: "POST" },
    ),

  videoRetention: (videoId: number) =>
    api<{
      ok: boolean;
      available: boolean;
      points: Array<{ t: number; ratio: number; relative: number | null }>;
    }>(`/youtube/videos/${videoId}/retention`),
};

export type VideoDetail = {
  id: number;
  external_video_id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  content_type: string | null;
  channel_id: number;
  channel_title: string | null;
  last_synced_at: string | null;
};

export type VideoDailySeriesRow = {
  date: string;
  views: number;
  watch_time_minutes: number;
  avg_view_duration_seconds: number;
  avg_percent_viewed: number;
  likes: number;
  comments: number;
  shares: number;
};

export type InsightsResponse = {
  ok: true;
  days: number;
  geography: Array<{ country: string | null; views: number }>;
  devices: Array<{ device: string | null; views: number }>;
  traffic_sources: Array<{ source: string | null; views: number }>;
};

export type VideoSummary = {
  video_id: number;
  external_video_id: string;
  title: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  content_type: string | null;
  views: number | null;
  watch_time_minutes: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subs_gained_from_video: number | null;
  estimated_revenue: number | null;
  impressions: number | null;
  click_through_rate: number | null;
  avg_view_duration_seconds: number | null;
  avg_percent_viewed: number | null;
};
