import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";

export default function Home() {
  const year = new Date().getFullYear();
  return (
    <>
      {/* ===== Nav ===== */}
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1180px,92vw)] items-center justify-between gap-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-[var(--ink-1)]">
            <LogoMark />
            <span className="text-[17px] font-bold tracking-tight">ReUnifyd</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[var(--ink-2)] md:flex">
            <a href="#features" className="transition hover:text-[var(--ink-1)]">Features</a>
            <a href="#modes" className="transition hover:text-[var(--ink-1)]">How it works</a>
            <Link href="/pricing" className="transition hover:text-[var(--ink-1)]">Pricing</Link>
            <a href="#faq" className="transition hover:text-[var(--ink-1)]">FAQ</a>
          </nav>
          <nav className="flex items-center gap-2.5">
            <AuthNav />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 0%, var(--accent-soft), transparent 70%)",
            }}
          />
          <div className="mx-auto w-[min(1180px,92vw)] pt-16 pb-10 text-center md:pt-24">
            <div className="flex justify-center">
              <span className="eyebrow">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                For creators who run more than one channel
              </span>
            </div>
            <h1 className="mx-auto mt-5 max-w-4xl text-[clamp(34px,6vw,64px)] font-extrabold leading-[1.04] tracking-[-0.02em]">
              One dashboard for{" "}
              <span className="text-[var(--accent)]">every channel</span> you run.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[clamp(16px,2.4vw,19px)] text-[var(--ink-2)]">
              ReUnifyd unifies analytics across all your YouTube channels —
              Instagram and TikTok next — so you can see what&apos;s working,
              catch what&apos;s failing, and compare the same content side by side.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="btn accent lg">
                Start free
              </Link>
              <Link href="/dashboard" className="btn lg">
                See live demo
              </Link>
            </div>
            <p className="mt-4 text-sm text-[var(--ink-3)]">
              Free during early access · Read-only access · No credit card
            </p>
          </div>

          {/* Product preview */}
          <div className="mx-auto w-[min(1180px,92vw)] pb-16">
            <DashboardPreview />
          </div>
        </section>

        {/* ===== Platform strip ===== */}
        <section className="border-y border-[var(--border)] bg-[var(--bg-2)]">
          <div className="mx-auto flex w-[min(1180px,92vw)] flex-col items-center gap-4 py-7 sm:flex-row sm:justify-between">
            <p className="text-sm font-medium text-[var(--ink-2)]">
              Connect the platforms you create on
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <PlatformChip name="YouTube" live />
              <PlatformChip name="Instagram" />
              <PlatformChip name="TikTok" />
            </div>
          </div>
        </section>

        {/* ===== Features ===== */}
        <section id="features" className="mx-auto w-[min(1180px,92vw)] py-20">
          <SectionHead
            eyebrow="Why ReUnifyd"
            title="Built for multi-channel creators."
            subtitle="Stop juggling YouTube Studio tabs and spreadsheets. Every channel, every metric, in one calm view."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Feature
              icon="▦"
              title="Unified overview"
              body="Connect once and see all your channels aggregated — views, watch time, subscribers, revenue — with flags when something needs attention."
            />
            <Feature
              icon="⇄"
              title="Same content, side by side"
              body="Group a YouTube Short with its Instagram Reel and TikTok. Compare normalized performance across platforms instantly."
            />
            <Feature
              icon="◷"
              title="Daily auto-sync"
              body="Fresh metrics pulled nightly from official APIs. Read-only access; your OAuth tokens stay encrypted at rest."
            />
          </div>
        </section>

        {/* ===== Two modes ===== */}
        <section id="modes" className="border-t border-[var(--border)] bg-[var(--bg-2)]">
          <div className="mx-auto w-[min(1180px,92vw)] py-20">
            <SectionHead
              eyebrow="Simple or deep — your call"
              title="Two modes. One toggle."
              subtitle="Switch between a clean overview and a full analytics workbench whenever you want."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <ModeCard
                mode="Simple"
                tagline="Is anything wrong?"
                points={[
                  "The four numbers that matter: views, watch time, subscribers, revenue",
                  "One trend line and your top movers",
                  "Red flags surfaced automatically",
                ]}
              />
              <ModeCard
                mode="Advanced"
                tagline="Show me everything."
                accent
                points={[
                  "Retention, CTR, impressions, traffic sources",
                  "Audience geography and devices",
                  "Best-time-to-post heatmap and title-pattern insights",
                  "Pivot any metric in Explore",
                ]}
              />
            </div>
          </div>
        </section>

        {/* ===== Pricing preview ===== */}
        <section id="pricing" className="mx-auto w-[min(1180px,92vw)] py-20">
          <SectionHead
            eyebrow="Pricing"
            title="Priced per channel, not per headache."
            subtitle="Most tools punish you for running more than one channel. We don't. Free while we're in early access."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <PriceCard
              name="Creator"
              price="$9"
              channels="Up to 3 channels"
              features={["All core analytics", "Daily auto-sync", "Simple & Advanced modes"]}
            />
            <PriceCard
              name="Pro"
              price="$24"
              channels="Up to 10 channels"
              featured
              features={["Everything in Creator", "Content groups & compare", "Anomaly alerts"]}
            />
            <PriceCard
              name="Studio"
              price="$59"
              channels="Up to 25 channels"
              features={["Everything in Pro", "Team-ready roll-ups", "Priority sync"]}
            />
          </div>
          <p className="mt-6 text-center text-sm text-[var(--ink-3)]">
            Free plan for 1 channel · +$2/channel beyond your plan ·{" "}
            <Link href="/pricing" className="font-medium text-[var(--accent)] hover:underline">
              See full pricing →
            </Link>
          </p>
        </section>

        {/* ===== How it works ===== */}
        <section className="border-t border-[var(--border)] bg-[var(--bg-2)]">
          <div className="mx-auto w-[min(1180px,92vw)] py-20">
            <SectionHead title="Set up in three steps." />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <Step n={1} title="Create your account" body="Pick how many channels you'll connect. Seconds, not forms." />
              <Step n={2} title="Connect channels" body="One-click OAuth for YouTube. Instagram and TikTok coming soon." />
              <Step n={3} title="Compare & decide" body="Watch trends, group content, double down on what works." />
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section id="faq" className="mx-auto w-[min(900px,92vw)] py-20">
          <SectionHead title="Frequently asked." />
          <div className="mt-10 space-y-3">
            <Faq q="Is ReUnifyd free?">
              Yes — fully free during early access. Paid plans for higher channel
              limits and faster syncs arrive later; you&apos;ll always keep a free tier.
            </Faq>
            <Faq q="Can you post or change anything on my channels?">
              No. We only request read-only access to analytics and channel info.
              We never have permission to publish, edit, or delete anything.
            </Faq>
            <Faq q="Where is my data stored?">
              On a managed Postgres database. OAuth tokens are encrypted at rest
              with Fernet, and you can export or delete your data at any time.
            </Faq>
            <Faq q="When will Instagram and TikTok be supported?">
              Instagram is next, followed by TikTok. The data model is already
              platform-agnostic — adding a platform is mostly an API integration.
            </Faq>
          </div>
        </section>

        {/* ===== Final CTA ===== */}
        <section className="mx-auto w-[min(1180px,92vw)] pb-20">
          <div
            className="overflow-hidden rounded-3xl border border-[var(--border)] p-10 text-center md:p-16"
            style={{
              background: "linear-gradient(180deg, var(--accent-soft), transparent)",
            }}
          >
            <h2 className="text-[clamp(26px,4vw,40px)] font-extrabold tracking-tight">
              Ready to unify your channels?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--ink-2)]">
              Free during early access. No credit card required.
            </p>
            <div className="mt-7 flex justify-center">
              <Link href="/signup" className="btn accent lg">
                Create your account
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-2)]">
        <div className="mx-auto flex w-[min(1180px,92vw)] flex-col gap-3 py-8 text-sm text-[var(--ink-2)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span>© {year} ReUnifyd</span>
          </div>
          <nav className="flex flex-wrap gap-5">
            <Link href="/about" className="hover:text-[var(--ink-1)]">About</Link>
            <Link href="/pricing" className="hover:text-[var(--ink-1)]">Pricing</Link>
            <Link href="/login" className="hover:text-[var(--ink-1)]">Log in</Link>
            <Link href="/signup" className="hover:text-[var(--ink-1)]">Sign up</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

/* ---------- Brand ---------- */

function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-[10px] font-bold text-white"
      style={{
        height: size,
        width: size,
        fontSize: size * 0.42,
        background: "linear-gradient(160deg, var(--accent), var(--accent-2))",
        boxShadow: "0 6px 16px var(--accent-soft)",
      }}
    >
      R
    </span>
  );
}

/* ---------- Product preview ---------- */

function DashboardPreview() {
  return (
    <div className="card overflow-hidden p-0 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.25)]">
      {/* faux window bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-2)] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[var(--danger)] opacity-70" />
        <span className="h-3 w-3 rounded-full bg-[var(--warn)] opacity-70" />
        <span className="h-3 w-3 rounded-full bg-[var(--ok)] opacity-70" />
        <span className="ml-3 text-xs font-medium text-[var(--ink-3)]">
          ReUnifyd · Overview · Last 28 days
        </span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[1.4fr_1fr] md:p-6">
        {/* left: KPIs + chart */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PreviewKpi label="Views" value="248.3K" trend="+12.4%" />
            <PreviewKpi label="Watch (h)" value="9,184" trend="+8.1%" />
            <PreviewKpi label="Subs" value="+1,402" trend="+3.6%" />
            <PreviewKpi label="Revenue" value="$1,920" trend="+5.2%" />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Views across channels</span>
              <span className="text-xs text-[var(--ink-3)]">28d</span>
            </div>
            <AreaChartMock />
          </div>
        </div>
        {/* right: channel list */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <span className="text-sm font-semibold">Your channels</span>
          <ul className="mt-3 space-y-2.5">
            <PreviewChannel name="Pebble Editz" subs="553K" spark={[6, 8, 7, 12, 10, 16, 14]} />
            <PreviewChannel name="EdStart" subs="91K" spark={[4, 5, 5, 4, 7, 6, 9]} />
            <PreviewChannel name="Daily Loops" subs="1.2M" spark={[14, 12, 15, 13, 18, 17, 20]} />
            <PreviewChannel name="Faceless Lab" subs="32K" spark={[3, 4, 3, 5, 4, 6, 5]} />
          </ul>
        </div>
      </div>
    </div>
  );
}

function PreviewKpi({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-[var(--ok)]">{trend}</div>
    </div>
  );
}

function AreaChartMock() {
  // Static, decorative area chart.
  const pts = [8, 14, 10, 18, 16, 24, 20, 28, 26, 34, 40, 36];
  const w = 100;
  const h = 36;
  const max = Math.max(...pts);
  const step = w / (pts.length - 1);
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (p / max) * (h - 4) - 2).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden="true">
      <defs>
        <linearGradient id="rfArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rfArea)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PreviewChannel({ name, subs, spark }: { name: string; subs: string; spark: number[] }) {
  const max = Math.max(...spark);
  const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 60},${16 - (v / max) * 14}`).join(" ");
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-3)] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
          {name.charAt(0)}
        </span>
        <div className="leading-tight">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-[var(--ink-3)]">{subs} subs</div>
        </div>
      </div>
      <svg viewBox="0 0 60 16" className="h-5 w-16" aria-hidden="true">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </li>
  );
}

/* ---------- Sections ---------- */

function SectionHead({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <div className="mb-3 flex justify-center">
          <span className="eyebrow">{eyebrow}</span>
        </div>
      ) : null}
      <h2 className="text-[clamp(24px,3.5vw,36px)] font-extrabold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-3 text-[var(--ink-2)]">{subtitle}</p> : null}
    </div>
  );
}

function PlatformChip({ name, live = false }: { name: string; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3.5 py-1.5 text-sm font-medium">
      {name}
      {live ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> Live
        </span>
      ) : (
        <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-xs font-medium text-[var(--ink-3)]">
          Soon
        </span>
      )}
    </span>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card p-6 transition hover:border-[var(--border-strong)]">
      <div
        aria-hidden="true"
        className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-lg text-[var(--accent)]"
      >
        {icon}
      </div>
      <h3 className="mb-1.5 text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">{body}</p>
    </div>
  );
}

function ModeCard({
  mode,
  tagline,
  points,
  accent = false,
}: {
  mode: string;
  tagline: string;
  points: string[];
  accent?: boolean;
}) {
  return (
    <div
      className="card p-6"
      style={accent ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">{mode} mode</span>
        {accent ? (
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
            Power users
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-xl font-bold tracking-tight">{tagline}</h3>
      <ul className="mt-4 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-[var(--ink-2)]">
            <span aria-hidden="true" className="mt-0.5 text-[var(--accent)]">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceCard({
  name,
  price,
  channels,
  features,
  featured = false,
}: {
  name: string;
  price: string;
  channels: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className="card relative flex flex-col p-6"
      style={featured ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
    >
      {featured ? (
        <span className="absolute -top-3 left-6 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white">
          Most popular
        </span>
      ) : null}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tracking-tight">{price}</span>
        <span className="text-sm text-[var(--ink-3)]">/mo</span>
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--accent)]">{channels}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--ink-2)]">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-0.5 text-[var(--accent)]">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`btn mt-6 justify-center ${featured ? "accent" : ""}`}
      >
        Start free
      </Link>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card p-6">
      <div
        className="mb-3 grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
        style={{ background: "var(--accent)" }}
      >
        {n}
      </div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="text-sm text-[var(--ink-2)]">{body}</p>
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
