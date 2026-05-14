import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";

export default function Home() {
  return (
    <>
      <header className="nav-bar">
        <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-[var(--ink-1)]">
            <span
              className="grid h-[38px] w-[38px] place-items-center rounded-[10px]"
              style={{
                background:
                  "radial-gradient(100% 100% at 50% 0%, #fefefe 0%, #e6eaee 100%)",
                boxShadow:
                  "inset 0 0 0 1px var(--border), 0 10px 20px rgba(0,0,0,.04)",
              }}
            >
              <span className="text-base font-bold">R</span>
            </span>
            <span className="font-bold tracking-wide">ReUnifyd</span>
          </Link>
          <nav className="flex items-center gap-2.5">
            <AuthNav />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-[min(1120px,92vw)] pt-[72px] pb-9">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            For multi-channel creators
          </span>
          <h1 className="my-4 text-[clamp(32px,5vw,56px)] font-bold leading-[1.05] tracking-tight">
            One dashboard for every channel you run.
          </h1>
          <p className="mb-7 max-w-2xl text-[clamp(16px,2.5vw,18px)] text-[var(--ink-2)]">
            ReUnifyd unifies your YouTube, Instagram, and TikTok analytics so
            you can compare the same content across platforms — side by side.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn primary">
              Get started — it&apos;s free
            </Link>
            <Link href="/dashboard" className="btn">
              View dashboard demo
            </Link>
          </div>
        </section>

        <section className="mx-auto w-[min(1120px,92vw)] pb-16">
          <div className="card p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
              <Panel title="Channel performance (28d)">
                <div className="grid grid-cols-3 gap-2.5">
                  <Kpi label="Views" value="248,302" trend="+12.4%" />
                  <Kpi label="Watch time (h)" value="9,184" trend="+8.1%" />
                  <Kpi label="Subscribers" value="+1,402" trend="+3.6%" />
                </div>
              </Panel>
              <Panel title="Cross-platform comparison">
                <ul className="space-y-2 text-sm">
                  <ComparisonRow platform="YouTube" views="98.2k" rate="6.4%" />
                  <ComparisonRow
                    platform="Instagram"
                    views="64.1k"
                    rate="4.1%"
                  />
                  <ComparisonRow platform="TikTok" views="86.0k" rate="9.2%" />
                </ul>
              </Panel>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-[min(1120px,92vw)] py-16">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Built for creators with multiple channels.
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-[var(--ink-2)]">
            Stop juggling YouTube Studio, Meta Business Suite, and TikTok
            Analytics. ReUnifyd brings every metric into one view.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            <Feature
              title="One unified dashboard"
              body="Connect your channels once. See every video and every metric without switching tabs."
            />
            <Feature
              title="Same content, side by side"
              body="Group a YouTube Short, an Instagram Reel and a TikTok of the same clip. Compare normalized rates instantly."
            />
            <Feature
              title="Daily auto-sync"
              body="We pull fresh metrics from official APIs every night. Read-only access, your tokens stay encrypted."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-[min(1120px,92vw)] py-16">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
            Set up in 3 steps.
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            <Step n={1} title="Sign up" body="Create an account in seconds." />
            <Step
              n={2}
              title="Connect channels"
              body="One-click OAuth for YouTube. Instagram and TikTok coming soon."
            />
            <Step
              n={3}
              title="Compare & decide"
              body="Group videos, watch trends, double-down on what works."
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-[min(900px,92vw)] py-16">
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
            Frequently asked
          </h2>
          <div className="space-y-3">
            <Faq q="Is ReUnifyd free?">
              Yes — fully free during early access. We&apos;ll introduce paid
              plans for higher channel limits and faster syncs later.
            </Faq>
            <Faq q="Can you post or change anything on my channels?">
              No. We only request read-only access to analytics and channel
              info. We never have permission to publish, edit, or delete
              anything.
            </Faq>
            <Faq q="Where is my data stored?">
              On a managed Postgres database. OAuth tokens are encrypted at
              rest with Fernet. You can delete your account and data at any
              time.
            </Faq>
            <Faq q="When will Instagram and TikTok be supported?">
              Instagram is next on the roadmap, followed by TikTok. The schema
              is already platform-agnostic — adding new platforms is mostly an
              API integration.
            </Faq>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-[min(900px,92vw)] py-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Ready to unify your channels?
          </h2>
          <p className="mb-8 text-[var(--ink-2)]">
            Free during early access. No credit card required.
          </p>
          <Link href="/signup" className="btn primary">
            Create your account
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-white/40">
        <div className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-2 py-8 text-sm text-[var(--ink-2)] sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} ReUnifyd</span>
          <nav className="flex gap-5">
            <Link href="/about" className="hover:underline">
              About
            </Link>
            <Link href="/pricing" className="hover:underline">
              Pricing
            </Link>
            <Link href="/login" className="hover:underline">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-[var(--ink-2)]">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card p-5">
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
        <span className="text-[var(--ink-2)] transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="mt-3 text-sm text-[var(--ink-2)]">{children}</div>
    </details>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] border border-[var(--border)] p-3.5"
      style={{ background: "linear-gradient(180deg, #ffffff, #f4f6f8)" }}
    >
      <h4 className="my-1 mb-3 text-sm font-semibold text-[var(--ink-2)]">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs font-semibold text-[var(--ok)]">{trend}</div>
    </div>
  );
}

function ComparisonRow({
  platform,
  views,
  rate,
}: {
  platform: string;
  views: string;
  rate: string;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-2">
      <span className="font-semibold">{platform}</span>
      <span className="text-[var(--ink-2)]">{views} views</span>
      <span className="font-semibold text-[var(--accent)]">{rate}</span>
    </li>
  );
}
