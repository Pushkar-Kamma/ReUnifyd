"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DashboardMode = "simple" | "advanced";

const STORAGE_KEY = "reunifyd:mode";

type ModeContextValue = {
  mode: DashboardMode;
  isAdvanced: boolean;
  setMode: (mode: DashboardMode) => void;
  toggle: () => void;
};

const ModeContext = createContext<ModeContextValue | null>(null);

/**
 * Provides the Simple/Advanced dashboard depth toggle.
 * - Simple: high-level KPIs and "is anything wrong" signals only.
 * - Advanced: full analytics surface (retention, CTR, heatmaps, explore...).
 * Persisted to localStorage; defaults to Simple for first-time users.
 */
export function DashboardModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>("simple");

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "simple" || stored === "advanced") {
        setModeState(stored);
      }
    } catch {
      // ignore unavailable storage
    }
  }, []);

  const setMode = useCallback((next: DashboardMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore unavailable storage
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "simple" ? "advanced" : "simple";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }, []);

  const value = useMemo<ModeContextValue>(
    () => ({ mode, isAdvanced: mode === "advanced", setMode, toggle }),
    [mode, setMode, toggle],
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useDashboardMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error("useDashboardMode must be used within a DashboardModeProvider");
  }
  return ctx;
}
