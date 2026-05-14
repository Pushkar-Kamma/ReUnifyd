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

export const youtube = {
  channels: () => api<ChannelsResponse>("/youtube/channels"),

  syncDaily: (channelId: number) =>
    api<unknown>("/youtube/sync/daily", {
      method: "POST",
      body: JSON.stringify({ channel_id: channelId }),
    }),
};
