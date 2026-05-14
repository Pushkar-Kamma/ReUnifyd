import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";

export default function AboutPage() {
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
        <section className="mx-auto w-[min(900px,92vw)] py-24">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">About</h1>
          <p className="mb-4 text-lg text-[var(--ink-2)]">
            ReUnifyd is a unified analytics dashboard for multi-channel
            creators. Skip the tab-switching between YouTube Studio, Instagram
            Insights, and TikTok Analytics — see everything in one place.
          </p>
          <p className="text-[var(--ink-2)]">
            Built for creators who post the same content across platforms and
            want apples-to-apples comparisons.
          </p>
        </section>
      </main>
    </>
  );
}
