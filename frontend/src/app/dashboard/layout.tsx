"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-[var(--ink-2)]">
        Loading…
      </div>
    );
  }

  if (!user) {
    // Effect will redirect; render nothing meanwhile.
    return null;
  }

  return (
    <>
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-[var(--ink-1)]"
          >
            <span
              className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
              style={{
                background:
                  "radial-gradient(100% 100% at 50% 0%, #fefefe 0%, #e6eaee 100%)",
                boxShadow:
                  "inset 0 0 0 1px var(--border), 0 10px 20px rgba(0,0,0,.04)",
              }}
            >
              <span className="text-sm font-bold">R</span>
            </span>
            <span className="font-bold tracking-wide">ReUnifyd</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <span className="text-[var(--ink-2)]">{user.email}</span>
            <button onClick={() => logout()} className="btn">
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
