"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { youtube, type Channel } from "@/lib/youtube";
import { ApiError, apiUrl } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";
import { ChannelSparkline } from "@/components/channel-sparkline";

function ChannelsContent() {
  const params = useSearchParams();
  const linked = params.get("linked") === "1";
  const oauthError = params.get("oauth_error");

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await youtube.channels();
      setChannels(res.channels);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load channels (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load channels.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // If any channel is still syncing (no last_synced_at), poll every 5s until all are done
  useEffect(() => {
    if (!channels) return;
    const hasPending = channels.some((c) => !c.last_synced_at);
    if (!hasPending) return;
    const timer = setTimeout(() => { void refresh(); }, 5000);
    return () => clearTimeout(timer);
  }, [channels, refresh]);

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">Channels</h1>
          <p className="text-[var(--ink-2)]">Your linked YouTube channels.</p>
        </div>
        <a
          href={apiUrl(`/auth/google/init?next=${encodeURIComponent("/dashboard/channels")}`)}
          className="btn"
        >
          Connect another
        </a>
      </div>

      {linked && !oauthError ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-4 text-sm"
          style={{ background: "rgba(34,197,94,0.08)" }}
        >
          ✓ YouTube connected. Channels listed below.{" "}
          <span className="text-[var(--ink-2)]">
            Data is syncing in the background — views and metrics will appear within a minute.
          </span>
        </div>
      ) : null}

      {oauthError ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-4 text-sm"
          style={{ background: "rgba(239,68,68,0.08)" }}
          role="alert"
        >
          OAuth failed: <span className="font-mono">{oauthError}</span>{" "}
          <Link href="/dashboard" className="font-semibold text-[var(--accent)]">
            Try again
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="card p-5 text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="card p-5 text-sm text-[var(--ink-2)]">Loading channels…</div>
      ) : channels && channels.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  const initial = (channel.title || "?").charAt(0).toUpperCase();
  return (
    <Link
      href={`/dashboard/channels/${channel.id}`}
      className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {channel.avatar_url ? (
          <Image
            src={channel.avatar_url}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-2)] text-lg font-bold text-[var(--ink-2)]">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{channel.title || "Untitled channel"}</div>
          {channel.custom_url ? (
            <div className="truncate text-xs text-[var(--ink-2)]">{channel.custom_url}</div>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between text-sm">
        <div>
          <div className="text-xs text-[var(--ink-2)]">Subscribers</div>
          <div className="text-lg font-bold">{formatCount(channel.subscriber_count)}</div>
        </div>
        <div className="text-right text-xs text-[var(--ink-2)]">
          {channel.last_synced_at
            ? `synced ${relativeTime(channel.last_synced_at)}`
            : <span className="animate-pulse text-amber-600">⟳ syncing…</span>}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
          28d views
        </span>
        <ChannelSparkline channelId={channel.id} />
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card p-8 text-center">
      <h2 className="mb-1 text-lg font-semibold">No channels yet</h2>
      <p className="mb-4 text-sm text-[var(--ink-2)]">
        Connect your YouTube account to pull in your channels.
      </p>
      <Link href="/dashboard" className="btn primary">
        Go to dashboard
      </Link>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense
      fallback={<div className="px-6 py-16 text-center text-[var(--ink-2)]">Loading…</div>}
    >
      <ChannelsContent />
    </Suspense>
  );
}