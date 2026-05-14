"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

/** Auth-aware nav buttons used in shared headers (.btn / .btn primary styles). */
export function AuthNav() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <span className="text-sm text-[var(--ink-2)]">…</span>;
  }

  if (user) {
    return (
      <>
        <Link href="/dashboard" className="btn">
          Dashboard
        </Link>
        <button onClick={() => logout()} className="btn">
          Log out
        </button>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="btn">
        Log in
      </Link>
      <Link href="/signup" className="btn primary">
        Sign up
      </Link>
    </>
  );
}
