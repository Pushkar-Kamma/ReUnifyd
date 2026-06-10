"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthNav } from "@/components/auth-nav";

type Tier = {
  name: string;
  monthly: number | null; // null = custom
  annualPerMonth: number | null;
  annualTotal: number | null;
  channels: string;
  features: string[];
  featured?: boolean;
  cta: string;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    monthly: 0,
    annualPerMonth: 0,
    annualTotal: 0,
    channels: "1 channel",
    features: ["Core analytics", "28-day history", "Simple & Advanced modes"],
    cta: "Start free",
  },
  {
    name: "Creator",
    monthly: 9,
    annualPerMonth: 7.5,
    annualTotal: 90,
    channels: "Up to 3 channels",
    features: ["Everything in Free", "Daily auto-sync", "Content groups"],
    cta: "Start free",
  },
  {
    name: "Pro",
    monthly: 24,
    annualPerMonth: 20,
    annualTotal: 240,
    channels: "Up to 10 channels",
    features: ["Everything in Creator", "Compare & anomaly alerts", "Full history"],
    featured: true,
    cta: "Start free",
  },
  {
    name: "Studio",
    monthly: 59,
    annualPerMonth: 49,
    annualTotal: 590,
    channels: "Up to 25 channels",
    features: ["Everything in Pro", "Team-ready roll-ups", "Priority sync"],
    cta: "Start free",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <>
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1180px,92vw)] items-center justify-between gap-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-[var(--ink-1)]">
            <span
              aria-hidden="true"
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] text-sm font-bold text-white"
              style={{ background: "linear-gradient(160deg, var(--accent), var(--accent-2))" }}
            >
              R
            </span>
            <span className="text-[17px] font-bold tracking-tight">ReUnifyd</span>
          </Link>
          <nav className="flex items-center gap-2.5">
            <AuthNav />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-[min(1180px,92vw)] pt-16 pb-10 text-center md:pt-20">
          <div className="flex justify-center">
            <span className="eyebrow">Pricing</span>
          </div>
          <h1 className="mx-auto mt-5 max-w-3xl text-[clamp(30px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight">
            Priced per channel, not per headache.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--ink-2)]">
            Run as many channels as you like without jumping to an
            &ldquo;enterprise&rdquo; tier. Everything is <strong>free during early
            access</strong> — these plans show where we&apos;re headed.
          </p>

          {/* billing toggle */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? "text-[var(--ink-1)]" : "text-[var(--ink-3)]"}`}>
              Monthly
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={annual}
              aria-label="Toggle annual billing"
              onClick={() => setAnnual((v) => !v)}
              className="relative h-6 w-11 rounded-full border border-[var(--border-strong)] transition"
              style={{ background: annual ? "var(--accent)" : "var(--bg-2)" }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                style={{ left: annual ? "calc(100% - 1.125rem)" : "0.125rem" }}
              />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-[var(--ink-1)]" : "text-[var(--ink-3)]"}`}>
              Annual
              <span className="ml-1.5 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                2 months free
              </span>
            </span>
          </div>
        </section>

        {/* tiers */}
        <section className="mx-auto w-[min(1180px,92vw)] pb-10">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <TierCard key={t.name} tier={t} annual={annual} />
            ))}
          </div>
        </section>

        {/* scale banner */}
        <section className="mx-auto w-[min(1180px,92vw)] pb-16">
          <div className="card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center md:p-8">
            <div>
              <h3 className="text-lg font-semibold">Scale &mdash; for networks &amp; agencies</h3>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                25+ channels, multi-client roll-ups, dedicated support, and custom
                integrations. Add channels beyond your plan at +$2/channel/mo.
              </p>
            </div>
            <Link href="/signup" className="btn lg whitespace-nowrap">
              Contact us
            </Link>
          </div>
        </section>

        {/* faq */}
        <section className="mx-auto w-[min(900px,92vw)] pb-20">
          <h2 className="mb-8 text-center text-[clamp(22px,3vw,32px)] font-extrabold tracking-tight">
            Pricing questions
          </h2>
          <div className="space-y-3">
            <Faq q="Do I pay anything right now?">
              No. ReUnifyd is free during early access. We&apos;ll give plenty of
              notice before any plan goes live, and there will always be a free tier.
            </Faq>
            <Faq q="How does per-channel pricing work?">
              Each plan includes a number of channels. Need a few more? Add them at
              +$2/channel/mo instead of jumping to the next tier.
            </Faq>
            <Faq q="Can I switch plans or cancel anytime?">
              Yes. Upgrade, downgrade, or cancel whenever you like — changes take
              effect at the end of your billing period.
            </Faq>
            <Faq q="What counts as a channel?">
              One connected account on a platform — e.g. a single YouTube channel.
              Instagram and TikTok channels will count the same way when they launch.
            </Faq>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-2)]">
        <div className="mx-auto flex w-[min(1180px,92vw)] flex-col gap-3 py-8 text-sm text-[var(--ink-2)] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ReUnifyd</span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/" className="hover:text-[var(--ink-1)]">Home</Link>
            <Link href="/about" className="hover:text-[var(--ink-1)]">About</Link>
            <Link href="/login" className="hover:text-[var(--ink-1)]">Log in</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function TierCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  const isCustom = tier.monthly === null;
  const price = isCustom
    ? "Custom"
    : annual
      ? `$${tier.annualPerMonth}`
      : `$${tier.monthly}`;
  const isFree = tier.monthly === 0;

  return (
    <div
      className="card relative flex flex-col p-6"
      style={tier.featured ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
    >
      {tier.featured ? (
        <span className="absolute -top-3 left-6 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white">
          Most popular
        </span>
      ) : null}
      <h3 className="text-lg font-semibold">{tier.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight">{price}</span>
        {!isCustom && !isFree ? <span className="text-sm text-[var(--ink-3)]">/mo</span> : null}
      </div>
      <p className="mt-1 min-h-5 text-xs text-[var(--ink-3)]">
        {isCustom || isFree
          ? "\u00a0"
          : annual
            ? `$${tier.annualTotal} billed yearly`
            : "billed monthly"}
      </p>
      <p className="mt-2 text-sm font-medium text-[var(--accent)]">{tier.channels}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--ink-2)]">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-0.5 text-[var(--accent)]">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`btn mt-6 justify-center ${tier.featured ? "accent" : ""}`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="card group p-5 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between font-semibold">
        <span>{q}</span>
        <span className="text-[var(--ink-2)] transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">{children}</div>
    </details>
  );
}
