"use client";

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
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <span className="text-xs text-zinc-500">
            backend: <span className="font-mono">{health}</span>
          </span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-zinc-500">
          Channels, videos, and comparisons go here.
        </p>
      </section>
    </main>
  );
}
