"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { youtube, type Channel } from "@/lib/youtube";
import { groups as groupsApi } from "@/lib/groups";

type Item = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon?: string;
  keywords?: string;
};

const STATIC_ITEMS: Item[] = [
  { id: "p:overview", label: "Overview", href: "/dashboard", icon: "▦", keywords: "home dashboard" },
  { id: "p:channels", label: "Channels", href: "/dashboard/channels", icon: "📺" },
  { id: "p:groups", label: "Content groups", href: "/dashboard/groups", icon: "🔗" },
  { id: "p:compare", label: "Compare", href: "/dashboard/compare", icon: "⇄" },
  { id: "p:explore", label: "Advanced mode", href: "/dashboard/explore", icon: "🔭" },
  { id: "p:sync", label: "Sync status", href: "/dashboard/sync", icon: "↻" },
];

function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  const idx = t.indexOf(q);
  if (idx >= 0) return 200 - idx;
  // subsequence match
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 50 : 0;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);

  // Global hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (cmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Load data once when opened
  useEffect(() => {
    if (!open) return;
    if (channels.length === 0) {
      youtube.channels().then((r) => setChannels(r.channels)).catch(() => {});
    }
    if (groups.length === 0) {
      groupsApi
        .list()
        .then((r) => {
          if (r.ok) setGroups(r.groups.map((g) => ({ id: g.id, name: g.name })));
        })
        .catch(() => {});
    }
    setQuery("");
    setActive(0);
  }, [open, channels.length, groups.length]);

  const items = useMemo<Item[]>(() => {
    const dynamic: Item[] = [
      ...channels.map((c) => ({
        id: `c:${c.id}`,
        label: c.title || "Untitled channel",
        hint: "Channel",
        href: `/dashboard/channels/${c.id}`,
        icon: "📺",
      })),
      ...groups.map((g) => ({
        id: `g:${g.id}`,
        label: g.name,
        hint: "Group",
        href: `/dashboard/groups/${g.id}`,
        icon: "🔗",
      })),
    ];
    const all = [...STATIC_ITEMS, ...dynamic];
    return all
      .map((it) => ({ it, s: score(query, `${it.label} ${it.keywords ?? ""}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((x) => x.it);
  }, [channels, groups, query]);

  const go = useCallback(
    (item: Item) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-start bg-black/40 p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="card w-full max-w-xl overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (items[active]) go(items[active]);
            }
          }}
          placeholder="Jump to channel, group, or page…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--ink-2)]">
              No matches
            </li>
          ) : (
            items.map((it, i) => (
              <li key={it.id}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === active
                      ? "bg-[var(--bg-2)] text-[var(--ink-1)]"
                      : "text-[var(--ink-1)] hover:bg-[var(--bg-2)]"
                  }`}
                >
                  <span className="w-5 text-center">{it.icon ?? "•"}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint ? (
                    <span className="shrink-0 text-xs text-[var(--ink-3)]">
                      {it.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-3)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5">↑</kbd>{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5">↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5">⏎</kbd>{" "}
            open
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
