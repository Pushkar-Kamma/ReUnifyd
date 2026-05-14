"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    api<{ status: string }>("/health")
      .then((r) => setHealth(r.status))
      .catch((e) => setHealth(`error: ${e.message}`));
  }, []);

  return (
    <>
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[var(--ink-1)]"
          >
            <span className="font-bold tracking-wide">ReUnifyd</span>
          </Link>
          <span className="text-xs text-[var(--ink-2)]">
            backend:{" "}
            <span className="font-mono font-semibold text-[var(--ink-1)]">
              {health}
            </span>
          </span>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-[min(1120px,92vw)] py-10">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mb-8 text-[var(--ink-2)]">
            Your channels, videos, and cross-platform comparisons live here.
          </p>

          <div className="card p-4">
            <p className="text-sm text-[var(--ink-2)]">
              Channels list, KPI cards, and charts will land here in the next
              phase.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
