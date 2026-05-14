"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ChannelsContent() {
  const params = useSearchParams();
  const linked = params.get("linked") === "1";
  const error = params.get("oauth_error");

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Channels</h1>
      <p className="mb-8 text-[var(--ink-2)]">
        Your linked YouTube channels.
      </p>

      {linked && !error ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-4 text-sm"
          style={{ background: "rgba(34,197,94,0.08)" }}
        >
          ✓ YouTube connected. Channels synced below.
        </div>
      ) : null}

      {error ? (
        <div
          className="mb-6 rounded-xl border border-[var(--border)] p-4 text-sm"
          style={{ background: "rgba(239,68,68,0.08)" }}
          role="alert"
        >
          OAuth failed: <span className="font-mono">{error}</span>{" "}
          <Link href="/dashboard" className="font-semibold text-[var(--accent)]">
            Try again
          </Link>
        </div>
      ) : null}

      <div className="card p-5">
        <p className="text-sm text-[var(--ink-2)]">
          Channel cards land here in the next phase.
        </p>
      </div>
    </section>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-16 text-center text-[var(--ink-2)]">Loading…</div>
      }
    >
      <ChannelsContent />
    </Suspense>
  );
}
