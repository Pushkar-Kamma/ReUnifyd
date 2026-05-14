"use client";

import Link from "next/link";
import { use } from "react";

export default function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <Link href="/dashboard/channels" className="text-sm text-[var(--accent)]">
        ← All channels
      </Link>
      <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight">
        Channel #{id}
      </h1>
      <p className="mb-8 text-[var(--ink-2)]">
        Charts and KPIs land here in the next phase.
      </p>
      <div className="card p-5 text-sm text-[var(--ink-2)]">Coming soon.</div>
    </section>
  );
}
