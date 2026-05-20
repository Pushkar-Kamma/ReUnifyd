"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastCtx = {
  toast: (message: string, kind?: ToastKind) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Soft fallback — log instead of throw so usage outside provider doesn't crash
    return {
      toast: (m, k = "info") => {
        if (typeof window !== "undefined") {
          console.log(`[toast:${k}]`, m);
        }
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const colors: Record<ToastKind, string> = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-[var(--ink-1)] text-white",
  };
  const icons: Record<ToastKind, string> = {
    success: "✓",
    error: "✕",
    info: "ⓘ",
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${colors[toast.kind]}`}
      style={{ animation: "toast-in 0.18s ease-out" }}
    >
      <span className="text-base font-bold">{icons[toast.kind]}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
