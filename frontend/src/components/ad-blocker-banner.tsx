"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

const STORAGE_KEY = "reunifyd:adblock-dismissed";

/** Shows a banner if the backend can't be reached due to client-side blocking
 *  (ad blocker, privacy extension, network firewall).
 *
 *  Detection: fire a no-credentials GET to /health. If it fails *and* the user
 *  has network connectivity (navigator.onLine), it's almost certainly a blocker
 *  treating *.onrender.com as a tracker.
 */
export function AdBlockerBanner() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    if (!navigator.onLine) return;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);

    fetch(apiUrl("/health"), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: ctrl.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
      })
      .catch(() => {
        // Only treat as blocked if we're online — otherwise it's just a network issue.
        if (navigator.onLine) setBlocked(true);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, []);

  if (!blocked) return null;

  return (
    <div
      className="sticky top-0 z-50 border-b border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-2.5 text-sm text-[var(--ink-1)]"
      role="alert"
    >
      <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3">
        <span>
          <strong className="mr-1.5">Heads up:</strong>
          An ad blocker or privacy extension looks like it&apos;s blocking
          ReUnifyd. Please disable it for this site so the app can talk to our
          API.
        </span>
        <button
          onClick={() => {
            sessionStorage.setItem(STORAGE_KEY, "1");
            setBlocked(false);
          }}
          className="shrink-0 rounded-md border border-[var(--warn)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--warn-soft)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
