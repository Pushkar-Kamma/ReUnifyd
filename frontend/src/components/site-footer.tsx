import Link from "next/link";
import { BrandMark } from "@/components/site-header";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Overview" },
      { href: "/pricing", label: "Pricing" },
      { href: "/dashboard", label: "Live demo" },
    ],
  },
  {
    title: "Company",
    links: [{ href: "/about", label: "About" }],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Start for free" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="mx-auto w-[min(1100px,92vw)] py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5 text-[var(--ink-1)]">
              <BrandMark size={28} />
              <span className="text-[15px] font-semibold tracking-tight">ReUnifyd</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">
              Analytics for creators who run more than one channel.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                {col.title}
              </h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[var(--ink-2)] transition hover:text-[var(--ink-1)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--border)] pt-6 text-sm text-[var(--ink-3)] sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} ReUnifyd</span>
          <span>Read only access. Your data stays private.</span>
        </div>
      </div>
    </footer>
  );
}
