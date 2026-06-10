"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/auth-nav";

const TABS = [
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-lg font-bold text-white"
      style={{
        height: size,
        width: size,
        fontSize: size * 0.46,
        background: "linear-gradient(155deg, var(--accent), var(--accent-2))",
      }}
    >
      R
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex w-[min(1100px,92vw)] items-center justify-between gap-6 py-3.5">
        <div className="flex items-center gap-9">
          <Link href="/" className="flex items-center gap-2.5 text-[var(--ink-1)]">
            <BrandMark />
            <span className="text-[16px] font-semibold tracking-tight">ReUnifyd</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive(t.href)
                    ? "text-[var(--ink-1)]"
                    : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex">
          <AuthNav />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] text-[var(--ink-1)] md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] md:hidden">
          <nav className="mx-auto flex w-[min(1100px,92vw)] flex-col py-2">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-2 py-2.5 text-sm font-medium ${
                  isActive(t.href) ? "text-[var(--ink-1)]" : "text-[var(--ink-2)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2.5 border-t border-[var(--border)] pt-3">
              <AuthNav />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
