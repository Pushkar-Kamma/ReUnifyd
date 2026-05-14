import Link from "next/link";

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
            <Link href="/login" className="btn">
              Log in
            </Link>
            <Link href="/signup" className="btn primary">
              Sign up
            </Link>
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
      </main>

      <footer className="mx-auto w-[min(1120px,92vw)] py-10 text-sm text-[var(--ink-2)]">
        © {new Date().getFullYear()} ReUnifyd
      </footer>
    </>
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
