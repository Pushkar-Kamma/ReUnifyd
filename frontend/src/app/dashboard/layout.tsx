"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiUrl } from "@/lib/api";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ToastProvider } from "@/components/toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { CommandPalette } from "@/components/command-palette";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [loading, user, router]);

  // Wake the Render backend on first dashboard load to minimize cold-start delay
  useEffect(() => {
    void fetch(apiUrl("/health"), {
      method: "GET",
      credentials: "omit",
    }).catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-[var(--ink-2)]">
        Loading…
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <header className="nav-bar">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 md:gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation menu"
              className="btn md:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              ☰
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-[var(--ink-1)]"
            >
            <span
              className="grid h-8 w-8 place-items-center rounded-md"
              style={{
                background:
                  "radial-gradient(100% 100% at 50% 0%, #fefefe 0%, #e6eaee 100%)",
                boxShadow: "inset 0 0 0 1px var(--border)",
              }}
            >
              <span className="text-sm font-bold">R</span>
            </span>
            <span className="text-base font-semibold tracking-tight">
              ReUnifyd
            </span>
          </Link>
          </div>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <Suspense fallback={null}>
              <PeriodSwitcher />
            </Suspense>
            <span className="hidden text-[var(--ink-2)] md:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <button onClick={() => logout()} className="btn">
              Log out
            </button>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <DashboardSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="min-w-0 flex-1 bg-[var(--bg-3)]"><ToastProvider><KeyboardShortcuts /><CommandPalette />{children}</ToastProvider></main>
      </div>
    </>
  );
}
