"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts for the dashboard.
 *  - `g d` -> /dashboard
 *  - `g c` -> /dashboard/channels
 *  - `g g` -> /dashboard/groups
 *  - `/`   -> focus first input/search on the page
 *  - `?`   -> show shortcut help
 *
 * Ignored when typing in inputs/textareas/contenteditable.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let leader = false;
    let leaderTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearLeader = () => {
      leader = false;
      if (leaderTimeout) {
        clearTimeout(leaderTimeout);
        leaderTimeout = null;
      }
    };

    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setShowHelp(false);
        clearLeader();
        return;
      }
      if (isEditable(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="Search" i], input[placeholder*="search" i]'
        );
        if (input) {
          e.preventDefault();
          input.focus();
          input.select?.();
        }
        return;
      }

      if (leader) {
        if (e.key === "d") {
          e.preventDefault();
          router.push("/dashboard");
        } else if (e.key === "c") {
          e.preventDefault();
          router.push("/dashboard/channels");
        } else if (e.key === "g") {
          e.preventDefault();
          router.push("/dashboard/groups");
        }
        clearLeader();
        return;
      }

      if (e.key === "g") {
        leader = true;
        leaderTimeout = setTimeout(clearLeader, 1200);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (leaderTimeout) clearTimeout(leaderTimeout);
    };
  }, [router]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/40 p-4"
      onClick={() => setShowHelp(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="card max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Keyboard shortcuts</h2>
        <ul className="space-y-2 text-sm">
          <Row keys={["⌘/Ctrl", "K"]} label="Command palette" />
          <Row keys={["g", "d"]} label="Go to dashboard" />
          <Row keys={["g", "c"]} label="Go to channels" />
          <Row keys={["g", "g"]} label="Go to groups" />
          <Row keys={["/"]} label="Focus search" />
          <Row keys={["?"]} label="Toggle this help" />
          <Row keys={["Esc"]} label="Close dialogs" />
        </ul>
        <div className="mt-5 text-right">
          <button onClick={() => setShowHelp(false)} className="btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="text-[var(--ink-1)]">{label}</span>
      <span className="flex gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="rounded border border-[var(--border)] bg-[var(--bg-2)] px-2 py-0.5 font-mono text-xs"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}
