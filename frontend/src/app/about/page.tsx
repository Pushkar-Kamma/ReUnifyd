import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "About · ReUnifyd",
  description:
    "Why ReUnifyd exists: a single, calm analytics dashboard for creators who run more than one channel.",
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-[min(820px,92vw)] pt-16 pb-12 md:pt-24">
          <h1 className="text-[clamp(30px,5vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em]">
            We build the dashboard we wished we had
          </h1>
          <p className="mt-6 text-[clamp(16px,2.2vw,19px)] leading-relaxed text-[var(--ink-2)]">
            Running one channel is hard enough. Running several means living
            inside a stack of separate studios, copying numbers into
            spreadsheets, and never quite seeing the full picture. ReUnifyd
            exists to fix that.
          </p>
        </section>

        <section className="border-t border-[var(--border)]">
          <div className="mx-auto w-[min(820px,92vw)] py-14">
            <h2 className="text-[clamp(20px,2.6vw,26px)] font-semibold tracking-tight">
              What we believe
            </h2>
            <div className="mt-6 space-y-6 text-[var(--ink-2)]">
              <Belief title="Clarity over clutter">
                A good dashboard answers one question first: is everything
                healthy? Detail should be there when you ask for it, not pushed
                in your face by default.
              </Belief>
              <Belief title="Built for many channels">
                Most tools assume you have one channel. We start from the
                opposite place. The more channels you run, the more useful
                ReUnifyd should become.
              </Belief>
              <Belief title="Your data stays yours">
                We ask only for read access, encrypt what we store, and let you
                export or delete your data whenever you want. Trust is the
                product.
              </Belief>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)]">
          <div className="mx-auto flex w-[min(820px,92vw)] flex-col items-start justify-between gap-5 py-14 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-[clamp(20px,2.8vw,28px)] font-semibold tracking-tight">
                Try it with your channels
              </h2>
              <p className="mt-2 text-[var(--ink-2)]">
                It is free during early access, and setup takes a couple of minutes.
              </p>
            </div>
            <Link href="/signup" className="btn accent lg whitespace-nowrap">
              Start for free
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Belief({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--accent)] pl-4">
      <h3 className="font-semibold text-[var(--ink-1)]">{title}</h3>
      <p className="mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}

