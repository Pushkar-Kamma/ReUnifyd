"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

type Tier = {
  name: string;
  monthly: number;
  annualPerMonth: number;
  annualTotal: number;
  channels: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    monthly: 0,
    annualPerMonth: 0,
    annualTotal: 0,
    channels: "1 channel",
    tagline: "For trying things out.",
    features: ["Core analytics", "28 days of history", "Simple and detailed views"],
  },
  {
    name: "Creator",
    monthly: 9,
    annualPerMonth: 7.5,
    annualTotal: 90,
    channels: "Up to 3 channels",
    tagline: "For a small set of channels.",
    features: ["Everything in Free", "Daily automatic sync", "Content groups"],
  },
  {
    name: "Pro",
    monthly: 24,
    annualPerMonth: 20,
    annualTotal: 240,
    channels: "Up to 10 channels",
    tagline: "For serious multi channel work.",
    features: ["Everything in Creator", "Compare and alerts", "Full history"],
    recommended: true,
  },
  {
    name: "Studio",
    monthly: 59,
    annualPerMonth: 49,
    annualTotal: 590,
    channels: "Up to 25 channels",
    tagline: "For networks and teams.",
    features: ["Everything in Pro", "Team ready roll ups", "Priority sync"],
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-[min(1100px,92vw)] pt-16 pb-10 md:pt-24">
          <h1 className="max-w-3xl text-[clamp(30px,5vw,52px)] font-semibold leading-[1.07] tracking-[-0.02em]">
            Pricing that rewards running more channels
          </h1>
          <p className="mt-5 max-w-2xl text-[clamp(16px,2.2vw,19px)] leading-relaxed text-[var(--ink-2)]">
            Other tools push you to an enterprise plan the moment you add a
            second channel. ReUnifyd does not. Everything is free during early
            access, and the plans below show where we are headed.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-[var(--border)] p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                !annual ? "bg-[var(--contrast)] text-[var(--on-contrast)]" : "text-[var(--ink-2)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                annual ? "bg-[var(--contrast)] text-[var(--on-contrast)]" : "text-[var(--ink-2)]"
              }`}
            >
              Annual
            </button>
            <span className="px-2 text-xs font-medium text-[var(--accent)]">Save 2 months</span>
          </div>
        </section>

        <section className="mx-auto w-[min(1100px,92vw)] pb-12">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <TierCard key={t.name} tier={t} annual={annual} />
            ))}
          </div>
          <p className="mt-6 text-sm text-[var(--ink-3)]">
            Need more than your plan includes? Add channels at 2 dollars per
            channel each month. For 25 channels or more, see Scale below.
          </p>
        </section>

        <section className="mx-auto w-[min(1100px,92vw)] pb-16">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--border)] p-6 sm:flex-row sm:items-center md:p-8">
            <div>
              <h3 className="text-lg font-semibold">Scale, for networks and agencies</h3>
              <p className="mt-1 max-w-xl text-sm text-[var(--ink-2)]">
                For 25 channels or more, with multi client roll ups, dedicated
                support, and custom integrations. We will tailor a plan to your team.
              </p>
            </div>
            <Link href="/signup" className="btn lg whitespace-nowrap">
              Contact us
            </Link>
          </div>
        </section>

        <section className="border-t border-[var(--border)]">
          <div className="mx-auto w-[min(820px,92vw)] py-16">
            <h2 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-tight">
              Pricing questions
            </h2>
            <div className="mt-8 divide-y divide-[var(--border)]">
              <Faq q="Do I pay anything right now?">
                No. ReUnifyd is free during early access. We will give plenty of
                notice before any plan goes live, and there will always be a free tier.
              </Faq>
              <Faq q="How does per channel pricing work?">
                Each plan includes a number of channels. If you need a few more,
                you add them for 2 dollars per channel each month, instead of
                jumping to the next plan.
              </Faq>
              <Faq q="Can I change plans or cancel anytime?">
                Yes. You can upgrade, downgrade, or cancel whenever you like.
                Changes take effect at the end of your billing period.
              </Faq>
              <Faq q="What counts as a channel?">
                One connected account on a platform, such as a single YouTube
                channel. Instagram and TikTok channels will count the same way
                when they launch.
              </Faq>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function TierCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  const isFree = tier.monthly === 0;
  const price = annual ? tier.annualPerMonth : tier.monthly;

  return (
    <div
      className="relative flex flex-col rounded-2xl border bg-[var(--bg)] p-6"
      style={{
        borderColor: tier.recommended ? "var(--accent)" : "var(--border)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{tier.name}</h3>
        {tier.recommended ? (
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
            Recommended
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-[var(--ink-2)]">{tier.tagline}</p>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-[34px] font-semibold tracking-tight">${price}</span>
        <span className="text-sm text-[var(--ink-3)]">{isFree ? "" : "/mo"}</span>
      </div>
      <p className="mt-1 min-h-[18px] text-xs text-[var(--ink-3)]">
        {isFree ? "Free forever" : annual ? `$${tier.annualTotal} billed yearly` : "Billed monthly"}
      </p>

      <p className="mt-4 text-sm font-medium">{tier.channels}</p>
      <ul className="mt-3 flex-1 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm text-[var(--ink-2)]">
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--accent)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/signup"
        className={`btn mt-6 justify-center ${tier.recommended ? "accent" : ""}`}
      >
        Start for free
      </Link>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-4 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between gap-4 text-[15px] font-medium">
        <span>{q}</span>
        <span className="text-[var(--ink-3)] transition group-open:rotate-180">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </summary>
      <div className="mt-2.5 text-sm leading-relaxed text-[var(--ink-2)]">{children}</div>
    </details>
  );
}
