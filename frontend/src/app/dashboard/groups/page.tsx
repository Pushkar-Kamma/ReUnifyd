"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { groups, type ContentGroupSummary } from "@/lib/groups";
import { ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export default function GroupsPage() {
  const [items, setItems] = useState<ContentGroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="mx-auto w-[min(1120px,92vw)] py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">
            Content groups
          </h1>
          <p className="text-[var(--ink-2)]">
            Group the same content posted across channels and compare
            performance side by side.
          </p>
        </div>
        <Link href="/dashboard/groups/new" className="btn primary">
          New group
        </Link>
      </div>

      {error ? (
        <div className="card p-5 text-sm text-red-600" role="alert">
          {error}
        </div>
      ) : items === null ? (
        <div className="card p-5 text-sm text-[var(--ink-2)]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="mb-1 text-lg font-semibold">No groups yet</h2>
          <p className="mb-4 text-sm text-[var(--ink-2)]">
            Create a group to compare the same video across multiple channels.
          </p>
          <Link href="/dashboard/groups/new" className="btn primary">
            Create your first group
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="card flex flex-col gap-2 p-5">
              <Link
                href={`/dashboard/groups/${g.id}`}
                className="text-base font-semibold hover:underline"
              >
                {g.name}
              </Link>
              {g.description ? (
                <p className="line-clamp-2 text-sm text-[var(--ink-2)]">
                  {g.description}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between text-xs text-[var(--ink-2)]">
                <span>
                  {g.item_count} video{g.item_count === 1 ? "" : "s"} ·
                  updated {relativeTime(g.updated_at)}
                </span>
                <button
                  onClick={() => onDelete(g.id)}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
