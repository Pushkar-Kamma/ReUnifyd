"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { groups, type ContentGroupSummary } from "@/lib/groups";
import { ApiError } from "@/lib/api";
import { formatCount, relativeTime } from "@/lib/format";

type SortKey = "name" | "item_count" | "total_views" | "updated_at";

export default function GroupsPage() {
  const [items, setItems] = useState<ContentGroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await groups.list();
      setItems(r.groups);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Failed to load groups (${err.status}).`
          : err instanceof Error
            ? err.message
            : "Failed to load groups.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete(id: number) {
    if (!confirm("Delete this group? Videos themselves are not removed.")) return;
    try {
      await groups.remove(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const filteredSorted = useMemo(() => {
    if (!items) return [];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? items.filter(
          (g) =>
            g.name.toLowerCase().includes(needle) ||
            (g.description || "").toLowerCase().includes(needle),
        )
      : items;
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "item_count":
          return b.item_count - a.item_count;
        case "total_views":
          return b.total_views - a.total_views;
        case "updated_at":
          return Date.parse(b.updated_at) - Date.parse(a.updated_at);
      }
    });
    return sorted;
  }, [items, search, sortKey]);

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Content groups</h1>
          <p className="text-sm text-[var(--ink-2)]">
            Group videos posted across channels to compare performance side by side.
          </p>
        </div>
        <Link href="/dashboard/groups/new" className="btn primary">
          + New group
        </Link>
      </div>

      {/* Search + sort toolbar */}
      {items && items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="flex-1 min-w-[200px] rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5 text-sm"
          >
            <option value="updated_at">Recently updated</option>
            <option value="name">Name (A-Z)</option>
            <option value="item_count">Most videos</option>
            <option value="total_views">Most views</option>
          </select>
          <span className="text-xs text-[var(--ink-2)]">
            {filteredSorted.length} of {items.length}
          </span>
        </div>
      )}

      {error ? (
        <div className="card p-5 text-sm text-red-600" role="alert">{error}</div>
      ) : items === null ? (
        <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : filteredSorted.length === 0 ? (
        <div className="card p-5 text-sm text-[var(--ink-2)]">
          No groups match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSorted.map((g) => (
            <GroupCard key={g.id} group={g} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupCard({
  group: g,
  onDelete,
}: {
  group: ContentGroupSummary;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/dashboard/groups/${g.id}`}
          className="text-base font-semibold leading-snug hover:underline"
        >
          {g.name}
        </Link>
        <button
          onClick={() => onDelete(g.id)}
          className="shrink-0 rounded p-1 text-xs text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600"
          title="Delete group"
        >
          ✕
        </button>
      </div>

      {g.description ? (
        <p className="line-clamp-2 text-sm text-[var(--ink-2)]">{g.description}</p>
      ) : null}

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-[var(--ink-2)]">Combined views</div>
          <div className="text-xl font-bold tabular-nums">{formatCount(g.total_views)}</div>
        </div>
        <div className="text-right text-xs text-[var(--ink-2)]">
          <div>{g.item_count} video{g.item_count === 1 ? "" : "s"}</div>
          <div>updated {relativeTime(g.updated_at)}</div>
        </div>
      </div>

      <Link
        href={`/dashboard/groups/${g.id}`}
        className="mt-1 rounded-lg border border-[var(--border)] py-1.5 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--bg-2)]"
      >
        View comparison →
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <div className="mb-3 text-4xl">📊</div>
      <h2 className="mb-1 text-lg font-semibold">No content groups yet</h2>
      <p className="mb-5 text-sm text-[var(--ink-2)]">
        Create a group and add the same video from multiple channels to see which
        version performs better.
      </p>
      <Link href="/dashboard/groups/new" className="btn primary">
        Create your first group
      </Link>
    </div>
  );
}
