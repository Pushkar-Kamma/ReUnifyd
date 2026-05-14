import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";

export default function PricingPage() {
  return (
    <>
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3">
          <Link href="/" className="font-bold tracking-wide">
            ReUnifyd
          </Link>
          <nav className="flex items-center gap-2.5">
            <AuthNav />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto w-[min(900px,92vw)] py-24 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Pricing</h1>
          <p className="mb-8 text-[var(--ink-2)]">
            Free during early access. Paid plans coming soon.
          </p>
          <Link href="/signup" className="btn primary">
            Sign up free
          </Link>
        </section>
      </main>
    </>
  );
}
