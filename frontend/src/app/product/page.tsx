import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Product · ReUnifyd",
  description:
    "See how ReUnifyd unifies your channels: one overview, side by side comparison, simple or detailed views, and fresh daily data.",
};

export default function ProductPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Intro */}
        <section className="mx-auto w-[min(1100px,92vw)] pt-16 pb-12 md:pt-24">
          <h1 className="max-w-3xl text-[clamp(30px,5vw,52px)] font-semibold leading-[1.07] tracking-[-0.02em]">
            Everything you track, in one dashboard
          </h1>
          <p className="mt-5 max-w-2xl text-[clamp(16px,2.2vw,19px)] leading-relaxed text-[var(--ink-2)]">
            ReUnifyd is built for people who run several channels. Instead of
            opening one studio after another, you get a single view that stays
            calm when you want the headline and goes deep when you need it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn accent lg">
              Start for free
            </Link>
            <Link href="/dashboard" className="btn lg">
              Open the live demo
            </Link>
          </div>
        </section>

        {/* Feature rows */}
        <FeatureRow
          label="Overview"
          title="See your whole operation at a glance"
          body="Every channel is aggregated into one set of numbers: views, watch time, subscribers, and revenue. When a channel starts to slip, it is flagged for you, so you spend your attention where it counts."
          bullets={[
            "Portfolio totals with clear trend direction",
            "Per channel breakdown one click away",
            "Quiet by default, detailed on demand",
          ]}
          visual={<OverviewVisual />}
        />

        <FeatureRow
          reverse
          label="Compare"
          title="Put channels on the same axes"
          body="Comparing channels usually means exporting numbers and building your own chart. ReUnifyd does it for you. Overlay two or more channels, switch to a normalized view, and read the head to head in seconds."
          bullets={[
            "Overlay multiple channels on one chart",
            "Normalize to compare different sizes fairly",
            "Head to head totals side by side",
          ]}
          visual={<CompareVisual />}
        />

        <FeatureRow
          label="Depth"
          title="Simple when you want it, detailed when you need it"
          body="Most days you only want to know if things are healthy. Some days you want the full story. A single toggle moves between a clean overview and the complete analytics surface, and it remembers your choice."
          bullets={[
            "Simple view: the four numbers that matter and a trend",
            "Detailed view: retention, click through, traffic, and audience",
            "Your preference is saved across visits",
          ]}
          visual={<DepthVisual />}
        />

        <FeatureRow
          reverse
          label="Data and privacy"
          title="Fresh data, handled with care"
          body="ReUnifyd pulls fresh metrics every day from official APIs. Access is read only, so the app can never post, edit, or delete anything on your channels. Your tokens are encrypted, and you can export or remove your data whenever you want."
          bullets={[
            "Daily automatic sync from official sources",
            "Read only access, never write access",
            "Tokens encrypted at rest, data you can delete",
          ]}
          visual={<DataVisual />}
        />

        {/* Platforms */}
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto w-[min(1100px,92vw)] py-16">
            <h2 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-tight">
              Built to grow with you
            </h2>
            <p className="mt-3 max-w-2xl text-[var(--ink-2)]">
              YouTube is supported today. Instagram and TikTok are on the way,
              and the dashboard is designed so they slot into the same views you
              already use.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <PlatformPill name="YouTube" status="Available now" available />
              <PlatformPill name="Instagram" status="Coming soon" />
              <PlatformPill name="TikTok" status="Coming soon" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto flex w-[min(1100px,92vw)] flex-col items-start justify-between gap-6 py-16 md:flex-row md:items-center">
            <h2 className="text-[clamp(24px,3.4vw,34px)] font-semibold tracking-tight">
              See it with your own channels
            </h2>
            <div className="flex gap-3">
              <Link href="/signup" className="btn accent lg whitespace-nowrap">
                Start for free
              </Link>
              <Link href="/pricing" className="btn lg whitespace-nowrap">
                View pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/* ---------- Feature row ---------- */

function FeatureRow({
  label,
  title,
  body,
  bullets,
  visual,
  reverse = false,
}: {
  label: string;
  title: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="border-t border-[var(--border)]">
      <div className="mx-auto grid w-[min(1100px,92vw)] items-center gap-10 py-16 md:grid-cols-2 md:py-20">
        <div className={reverse ? "md:order-2" : ""}>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
            {label}
          </span>
          <h2 className="mt-3 text-[clamp(22px,3.2vw,32px)] font-semibold leading-tight tracking-tight">
            {title}
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--ink-2)]">{body}</p>
          <ul className="mt-5 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 text-sm text-[var(--ink-1)]">
                <CheckIcon />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={reverse ? "md:order-1" : ""}>{visual}</div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function VisualFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_24px_60px_-44px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 text-xs font-medium text-[var(--ink-3)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        {label}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  );
}

/* ---------- Visuals ---------- */

function OverviewVisual() {
  return (
    <VisualFrame label="Overview">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Views", "248.3K", "+12.4%"],
          ["Watch time", "9,184 h", "+8.1%"],
          ["Subscribers", "+1,402", "+3.6%"],
          ["Revenue", "$1,920", "+5.2%"],
        ].map(([l, v, t]) => (
          <div key={l} className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-xs text-[var(--ink-2)]">{l}</div>
            <div className="mt-0.5 text-lg font-semibold tracking-tight">{v}</div>
            <div className="text-xs font-medium text-[var(--ok)]">{t}</div>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function CompareVisual() {
  const a = [10, 14, 12, 18, 22, 20, 26, 30];
  const b = [8, 9, 11, 10, 13, 15, 14, 18];
  return (
    <VisualFrame label="Compare">
      <TwoLineChart a={a} b={b} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Pebble Editz
          </div>
          <div className="mt-1 text-base font-semibold">152K views</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
            <span className="h-2 w-2 rounded-full bg-[var(--ink-3)]" /> EdStart
          </div>
          <div className="mt-1 text-base font-semibold">96K views</div>
        </div>
      </div>
    </VisualFrame>
  );
}

function DepthVisual() {
  return (
    <VisualFrame label="Detail level">
      <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
        <span className="text-sm font-medium">View</span>
        <span className="inline-flex rounded-full border border-[var(--border)] p-0.5 text-xs">
          <span className="rounded-full px-3 py-1 text-[var(--ink-2)]">Simple</span>
          <span className="rounded-full bg-[var(--accent)] px-3 py-1 font-medium text-white">Detailed</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["Retention", "Click through", "Traffic", "Audience", "Devices", "Best time"].map((m) => (
          <div key={m} className="rounded-lg border border-[var(--border)] px-2.5 py-3 text-center text-xs font-medium text-[var(--ink-2)]">
            {m}
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function DataVisual() {
  return (
    <VisualFrame label="Sync status">
      <ul className="space-y-2.5">
        {[
          ["Pebble Editz", "Synced 2 hours ago"],
          ["EdStart", "Synced 2 hours ago"],
          ["Daily Loops", "Synced 3 hours ago"],
        ].map(([name, status]) => (
          <li key={name} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5">
            <span className="text-sm font-medium">{name}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ok)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              {status}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2.5 text-xs text-[var(--ink-2)]">
        <LockIcon />
        Read only access. Tokens encrypted at rest.
      </div>
    </VisualFrame>
  );
}

function TwoLineChart({ a, b }: { a: number[]; b: number[] }) {
  const w = 100;
  const h = 44;
  const max = Math.max(...a, ...b);
  const toPath = (arr: number[]) =>
    arr
      .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (arr.length - 1)) * w).toFixed(2)},${(h - (p / max) * (h - 4) - 2).toFixed(2)}`)
      .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full" aria-hidden="true">
      <path d={toPath(b)} fill="none" stroke="var(--ink-3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={toPath(a)} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PlatformPill({ name, status, available = false }: { name: string; status: string; available?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
      <span className="text-sm font-semibold">{name}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          available
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "bg-[var(--bg-2)] text-[var(--ink-3)]"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
