"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiUrl, ApiError } from "@/lib/api";
import { youtube } from "@/lib/youtube";

export default function DashboardPage() {
  const { user } = useAuth();
  const [channelCount, setChannelCount] = useState<number | null>(null);

  useEffect(() => {
    youtube
      .channels()
      .then((r) => setChannelCount(r.total))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setChannelCount(0);
      });
  }, []);

  const connectYouTube = () => {
    window.location.href = apiUrl(
      `/auth/google/init?next=${encodeURIComponent("/dashboard/channels")}`,
    );
  };

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">
        Welcome{user?.name ? `, ${user.name}` : ""}.
      </h1>
      <p className="mb-8 text-[var(--ink-2)]">
        Your channels, videos, and cross-platform comparisons live here.
      </p>

      <div className="card p-5">
        {channelCount === null ? (
          <p className="text-sm text-[var(--ink-2)]">Loading…</p>
        ) : channelCount === 0 ? (
          <>
            <h2 className="mb-1 text-lg font-semibold">Get started</h2>
            <p className="mb-4 text-sm text-[var(--ink-2)]">
              Connect your YouTube channel to start syncing analytics. We only
              request read-only access.
            </p>
            <button onClick={connectYouTube} className="btn primary">
              Connect YouTube
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-semibold">
              {channelCount} channel{channelCount === 1 ? "" : "s"} linked
            </h2>
            <p className="mb-4 text-sm text-[var(--ink-2)]">
              Open your channels to view their analytics.
            </p>
            <div className="flex gap-2">
              <Link href="/dashboard/channels" className="btn primary">
                View channels
              </Link>
              <button onClick={connectYouTube} className="btn">
                Connect another
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}