"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiUrl } from "@/lib/api";
import { DashboardModeProvider } from "@/lib/dashboard-mode";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ToastProvider } from "@/components/toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { BrandMark } from "@/components/site-header";

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
        Loading
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardModeProvider>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:gap-4 md:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation menu"
              className="grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] md:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <Link href="/dashboard" className="flex items-center gap-2.5 text-[var(--ink-1)]">
              <BrandMark size={30} />
              <span className="text-[15px] font-semibold tracking-tight">ReUnifyd</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 text-sm md:gap-3">
            <div className="hidden sm:block">
              <ModeToggle />
            </div>
            <Suspense fallback={null}>
              <PeriodSwitcher />
            </Suspense>
            <NotificationBell />
            <ThemeToggle />
            <UserMenu email={user.email} onLogout={() => logout()} />
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-4 py-2 sm:hidden">
          <ModeToggle />
        </div>
      </header>

      <div className="flex flex-1">
        <DashboardSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="min-w-0 flex-1 bg-[var(--bg-3)]">
          <ToastProvider>
            <KeyboardShortcuts />
            <CommandPalette />
            {children}
          </ToastProvider>
        </main>
      </div>
    </DashboardModeProvider>
  );
}

function UserMenu({ email, onLogout }: { email: string | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initial = (email || "?").charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]"
      >
        {initial}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="text-xs text-[var(--ink-3)]">Signed in as</div>
              <div className="truncate text-sm font-medium">{email}</div>
            </div>
            <Link
              href="/dashboard/channels"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm transition hover:bg-[var(--bg-2)]"
            >
              Manage channels
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="block w-full px-4 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--bg-2)]"
            >
              Log out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
