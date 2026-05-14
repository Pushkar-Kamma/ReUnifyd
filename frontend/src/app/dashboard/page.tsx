"use client";

import { useAuth } from "@/lib/auth-context";
import { apiUrl } from "@/lib/api";

export default function DashboardPage() {
  const { user } = useAuth();

  const connectYouTube = () => {
    // OAuth init must be a top-level navigation (not fetch) so Google can set
    // its own cookies and we land back on our session-bearing callback.
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
        <h2 className="mb-1 text-lg font-semibold">Get started</h2>
        <p className="mb-4 text-sm text-[var(--ink-2)]">
          Connect your YouTube channel to start syncing analytics. We only
          request read-only access to your channel data and analytics.
        </p>
        <button onClick={connectYouTube} className="btn primary">
          Connect YouTube
        </button>
      </div>
    </section>
  );
}