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

  timeseries: (channelId: number, days: number = 28) =>
    api<TimeseriesResponse>(
      `/youtube/channel/timeseries?channel_id=${channelId}&days=${days}`,
    ),
};
