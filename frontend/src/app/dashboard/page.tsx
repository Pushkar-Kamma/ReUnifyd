"use client";

import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

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
          Connect your YouTube channel to start syncing analytics.
        </p>
        <button className="btn primary" disabled>
          Connect YouTube · coming next
        </button>
      </div>
    </section>
  );
}