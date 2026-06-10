import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-[min(1100px,92vw)] pt-20 pb-14 text-center md:pt-28">
          <h1 className="mx-auto max-w-3xl text-[clamp(36px,6vw,60px)] font-semibold leading-[1.06] tracking-[-0.02em]">
            Analytics for creators who run more than one channel
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[clamp(16px,2.2vw,19px)] leading-relaxed text-[var(--ink-2)]">
            ReUnifyd brings all of your channels into one clear dashboard. See
            what is growing, catch what is slipping, and decide where your time
            should go.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn accent lg">
              Start for free
            </Link>
            <Link href="/product" className="btn lg">
              Browse the product
            </Link>
          </div>
          <p className="mt-5 text-sm text-[var(--ink-3)]">
            Free during early access. Read only access. No credit card required.
          </p>
        </section>

        {/* Product preview */}
        <section className="mx-auto w-[min(1100px,92vw)] pb-20">
          <DashboardPreview />
        </section>

        {/* Value props */}
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto grid w-[min(1100px,92vw)] gap-x-10 gap-y-12 py-20 md:grid-cols-3">
            <ValueProp
              icon={<IconLayers />}
              title="One place for every channel"
              body="Connect your channels once and track them together. The numbers that matter sit on top, so a quick look tells you where things stand."
            />
            <ValueProp
              icon={<IconCompare />}
              title="Compare without spreadsheets"
              body="Put channels on the same scale and see which content earns its keep. No exporting, no manual charts, no guesswork."
            />
            <ValueProp
              icon={<IconSliders />}
              title="Simple or detailed"
              body="Start with a calm overview of the essentials. Open the full analytics when you want retention, traffic, and the deeper story."
            />
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-[var(--border)]">
          <div className="mx-auto flex w-[min(1100px,92vw)] flex-col items-start justify-between gap-6 py-16 md:flex-row md:items-center">
            <div>
              <h2 className="text-[clamp(24px,3.4vw,34px)] font-semibold tracking-tight">
                Bring your channels together
              </h2>
              <p className="mt-2 text-[var(--ink-2)]">
                Set up takes a couple of minutes. You can connect a channel and
                see your first dashboard today.
              </p>
            </div>
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

/* ---------- Value prop ---------- */

function ValueProp({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{body}</p>
    </div>
  );
}

/* ---------- Product preview ---------- */

function DashboardPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_30px_70px_-40px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-1)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          Overview
        </div>
        <span className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--ink-2)]">
          Last 28 days
        </span>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[1.45fr_1fr] md:p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PreviewKpi label="Views" value="248.3K" trend="+12.4%" />
            <PreviewKpi label="Watch (h)" value="9,184" trend="+8.1%" />
            <PreviewKpi label="Subscribers" value="+1,402" trend="+3.6%" />
            <PreviewKpi label="Revenue" value="$1,920" trend="+5.2%" />
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Views across channels</span>
              <span className="text-xs text-[var(--ink-3)]">28 days</span>
            </div>
            <AreaChartMock />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <span className="text-sm font-medium">Your channels</span>
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
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--ink-2)]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight">{value}</div>
      <div className="text-xs font-medium text-[var(--ok)]">{trend}</div>
    </div>
  );
}

function AreaChartMock() {
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
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
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
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
          {name.charAt(0)}
        </span>
        <div className="leading-tight">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-[var(--ink-3)]">{subs} subscribers</div>
        </div>
      </div>
      <svg viewBox="0 0 60 16" className="h-5 w-16" aria-hidden="true">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </li>
  );
}

/* ---------- Icons ---------- */

function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function IconCompare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="20" x2="6" y2="11" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

