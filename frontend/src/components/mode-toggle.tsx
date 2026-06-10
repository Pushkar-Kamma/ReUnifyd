"use client";

import { useDashboardMode } from "@/lib/dashboard-mode";

/**
 * Segmented control for switching between Simple and Advanced dashboard depth.
 * Simple shows the essentials; Advanced reveals the full analytics surface.
 */
export function ModeToggle() {
  const { mode, setMode } = useDashboardMode();
  return (
    <div
      role="group"
      aria-label="Dashboard detail level"
      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--bg)] p-0.5"
    >
      <Option active={mode === "simple"} onClick={() => setMode("simple")}>
        Simple
      </Option>
      <Option active={mode === "advanced"} onClick={() => setMode("advanced")}>
        Detailed
      </Option>
    </div>
  );
}

function Option({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-[var(--contrast)] text-[var(--on-contrast)]"
          : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"
      }`}
    >
      {children}
    </button>
  );
}
