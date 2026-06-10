# ReUnifyd — Product Requirements (v1)

> One dashboard for every channel you run. Cross-platform analytics for creators
> who manage multiple YouTube, Instagram, and TikTok accounts.

**Status:** Draft for the v1 redesign (landing page, auth/sign-up flow, dashboard).
**Last updated:** 2026-06-09
**Owner:** Pushkar

---

## 1. Vision & positioning

ReUnifyd is the **mission-control dashboard for multi-channel creators**. Today's
tools (YouTube Studio, vidIQ, TubeBuddy) are built for one channel at a time and
one platform at a time. Creators and small teams who run *several* channels (or
the same brand across YouTube + Instagram + TikTok) have to log in and out, tab
between Studios, and manually stitch numbers together.

**Our selling point:** *See all your channels, across every platform, in one
place — and instantly know what's working and what's going wrong.*

We win on three things:
1. **Multi-channel first** — built from the ground up for people with 2–50 channels.
2. **Cross-platform** — YouTube now; Instagram and TikTok next, in the same views.
3. **Two depths of insight** — a **Simple** mode for "is anything wrong?" and an
   **Advanced** mode for "show me everything," switchable per user.

---

## 2. Target audience

| Persona | Who they are | Channels | What they care about |
|---|---|---|---|
| **The Portfolio Creator** | Runs several niche channels solo (e.g. a gaming + a vlog + a faceless automation channel) | 2–8 | "Which channel deserves my time this week? Is any channel dying?" |
| **The Multi-Platform Brand** | One brand pushed to YouTube + IG + TikTok | 1 brand, 3 platforms | "Which platform is growing? Where should I repost this clip?" |
| **The Faceless/Network Operator** | Runs/automates many monetized channels | 5–50 | "Total revenue & views across the portfolio. Anomalies. Outliers." |
| **The Small Agency / MCN** | Manages channels for clients | 5–50, multi-client | "Per-client roll-ups, clean reports, who's underperforming." |
| **The Manager/Editor** | Works on someone else's channels | shared | "Read-only or scoped access to the channels I work on." |

**Primary target for v1:** the *Portfolio Creator* and the *Multi-Platform Brand*.
Everything else is a natural extension of the same data model.

---

## 3. Audience needs (jobs-to-be-done)

Format: *When I… I want to… so that…* → **what we must provide**.

1. **When I open the app**, I want a single glance to tell me if anything is wrong
   across all my channels → **portfolio overview with at-a-glance health + anomaly
   flags.**
2. **When a video pops off (or tanks)**, I want to be told without digging →
   **notifications / anomaly badges.**
3. **When I compare channels**, I want them side-by-side on the same axes →
   **multi-channel compare with normalize toggle.**
4. **When the same content lives on 3 platforms**, I want to compare its
   performance per platform → **content groups across platforms.**
5. **When I'm a "big picture" person**, I don't want to drown in metrics →
   **Simple mode: views, watch time, subs net, revenue, "are we up or down."**
6. **When I'm optimizing**, I want the deep stuff → **Advanced mode: retention,
   CTR, impressions, traffic sources, best-time heatmap, title patterns.**
7. **When I sign up**, I want to say how many channels I'll connect and get going
   fast → **channel-count selection + guided multi-account connect.**
8. **When I come back**, I don't want to retype my password → **persistent
   session + "remembered account" fast login, with show-password option.**
9. **When I add/remove a channel**, I want it to be safe and clear what happens to
   my data → **explicit connect/disconnect flow with a privacy explainer.**
10. **When I use my phone / tablet / TV**, the app should just work → **fully
    responsive, touch-friendly, large-screen-friendly.**

---

## 4. Functional requirements

### 4.1 Landing page (public)

Reference feel: **Notion / Replit / Linear** structure with a **YouTube-Studio-clean**
aesthetic. Marketing site that converts.

Must have, in order:
- **Sticky top nav**: logo, Product, Pricing, (Docs/About), `Log in`, `Sign up` (primary).
- **Hero**: one-line value prop, sub-paragraph, two CTAs (`Start free`, `See live demo`),
  and a **real product screenshot/mock** of the dashboard (light + subtle shadow).
- **Logo/social proof strip** (placeholder logos OK for now).
- **Platform strip**: YouTube (live), Instagram + TikTok (badged "Coming soon").
- **Feature sections** (3–4, alternating image/text):
  - Unified multi-channel overview
  - Same content, side-by-side across platforms
  - Simple ↔ Advanced depth toggle
  - Daily auto-sync, anomaly alerts
- **"Two modes" explainer**: visual of Simple vs Advanced.
- **Pricing preview** (3 tiers, link to `/pricing`).
- **FAQ** (data privacy, platforms supported, cancel anytime).
- **Final CTA band** + **footer** (links, legal, socials).

Non-negotiables: responsive at 360px → 4K, dark-mode aware, fast (mostly static),
accessible (semantic landmarks, focus states, alt text).

### 4.2 Authentication & sign-up flow

#### Log in
- Email + password.
- **Show/hide password** toggle (eye icon).
- **Fast re-auth**: if a valid session exists, route straight to the dashboard
  (skip the form). If the email is "remembered" (local hint, non-sensitive),
  pre-fill it and just ask for the password.
- Google "Continue with Google" as a one-click path.
- Friendly, specific error states (already handled pattern: 401/403/429 banners).
- `?next=` redirect support.

#### Sign up (multi-step wizard)
The new flow is a guided wizard, not a single form:

1. **Step 1 — Plan / channel count.** "How many channels will you connect?"
   - A stepper / selector for channel count.
   - Live price preview based on the **per-channel** model (see §6). Annual/monthly toggle.
   - Payment is **bypassed for now** (feature-flagged) — we record the intended
     plan (`?plan=`, already plumbed through OAuth) and continue.
2. **Step 2 — Account details.** Email, display name, password (with show toggle,
   strength hint), accept terms. *2FA is planned (TOTP) — scaffold the step but it
   can be a no-op/optional in v1.*
3. **Step 3 — Connect accounts.** "You chose N channels." Render **N connect
   slots**. Each slot = "Connect with Google/YouTube" → OAuth → fills the slot
   with the channel avatar + name.
   - User can change N here; the number of slots updates live.
   - If they connected more than their plan (e.g. 5 connected, plan is 4), **block
     and prompt them to pick one to remove**, showing exactly:
     - what disconnecting does (we stop syncing, revoke our token),
     - what happens to already-collected data (retained X days / deletable now),
     - a confirm step.
4. **Step 4 — (Payment placeholder)** — skipped while monetization is off.
5. **Done → Dashboard**, with the onboarding checklist.

Backend implications (new work):
- Introduce a lightweight **plan/quota** concept (see §6 + §8): `User.plan`,
  `User.channel_quota`, enforced at channel-link time (HTTP 402/409 with a clear body).
- **Disconnect channel** endpoint: revoke Google token, soft-delete `UserChannel`,
  and a data-handling policy (retain vs purge `*_daily_metrics`).
- Keep current rate-limiting and session model.

### 4.3 Dashboard (authenticated app)

The dashboard is the heart of the product. It must feel like **YouTube Studio /
Instagram Insights / Spotify for Artists** — familiar, calm, fast — but unified.

#### Global shell
- **Left sidebar** (collapsible, hidden under a hamburger on mobile): Overview,
  Channels, Compare, Content Groups, Explore, Sync status, Settings.
- **Top bar**: channel/platform scope picker, period switcher (7/28/90/custom),
  **Simple ↔ Advanced toggle**, command palette (⌘K), notifications, theme, avatar menu.
- **Mode is the key new concept:**
  - **Simple mode** shows only: big KPI cards (Views, Watch time, Subscribers net,
    Revenue), one trend chart, top movers, and any red flags. Everything else hidden.
  - **Advanced mode** reveals: retention, CTR/impressions, traffic sources,
    audience geo/devices, best-time heatmap, title-pattern insights, content-type
    split, explore tab. Mode persists per user (localStorage + later server-side).

#### Pages
1. **Overview (portfolio).** All channels aggregated.
   - Simple: 4 KPIs + portfolio trend + "needs attention" list.
   - Advanced: + per-channel mini-cards, content-type split, anomalies feed.
2. **Channels.** Grid/list of every channel with sparkline, subs, last sync,
   freshness badge, quick-actions. Add channel (OAuth).
3. **Channel detail `[id]`.** The "Studio" view for one channel.
   - Simple: KPIs + trend + top videos.
   - Advanced: + health score, retention, heatmap, title patterns, goals, audience.
4. **Compare.** Pick up to N channels (and later, platforms) → overlaid charts,
   normalize toggle, side-by-side KPI table, head-to-head.
5. **Content Groups.** Cross-platform grouping of equivalent content; per-group
   roll-ups; ready for IG/TikTok rows.
6. **Explore (Advanced only).** Pivot: metric × dimension (time/channel/video/
   content-type) × group-by × chart type.
7. **Sync status.** Per-channel freshness, manual re-sync, "data is delayed up to
   ~48h" explainer (we learned this is a real YouTube Analytics limitation).
8. **Settings.** Profile, plan & channels, theme, mode default, data & privacy
   (export, disconnect, delete).

### 4.4 Multi-platform readiness (Instagram + TikTok)

Even though v1 ships YouTube-only data, **the redesign must be built so adding a
platform is additive, not a rewrite**:
- Treat every metric view as **platform-aware**: a `platform` field/badge on
  channels, videos, KPIs, and compare rows.
- A **normalized metric vocabulary** so platforms map onto shared concepts:
  - Views ↔ Views/Plays, Watch time ↔ View time, Subscribers ↔ Followers,
    Likes/Comments/Shares are shared, Revenue where available.
- UI: platform filter in the scope picker; "Coming soon" states for IG/TikTok
  with a waitlist toggle.
- Backend: `Platform` table already supports this; future IG Graph API / TikTok
  Display+Analytics API connectors mirror the Google OAuth + sync-service shape.

---

## 5. Non-functional requirements

- **Responsive:** 360px phones → tablets → laptops → 4K/TV. Fluid type (`clamp`),
  CSS grid, touch targets ≥ 44px, no horizontal scroll, large-screen max-widths.
- **Performance:** landing mostly static/SSG; dashboard data cached (overview LRU
  already exists); skeletons for all async; avoid layout shift.
- **Accessibility:** WCAG AA contrast, semantic landmarks, keyboard nav, focus
  rings, `aria-live` for async/error banners, `prefers-reduced-motion`.
- **Theming:** light + dark + YouTube-red accent option (see §7); persisted, no flash.
- **Security:** keep OWASP hygiene — existing rate-limiting, encrypted tokens
  (Fernet), validated redirects, HttpOnly sessions; add quota checks server-side
  (never trust client for channel limits).
- **Privacy:** clear data-handling copy at connect/disconnect; export & delete.

---

## 6. Pricing & market analysis

### 6.1 What competitors charge (researched 2026-06-09)

| Product | Model | Entry paid | Mid | High | Notes |
|---|---|---|---|---|---|
| **vidIQ** | Per-creator (AI tools) | Boost **$16.58/mo** (annual) | Max **$39/mo** | Enterprise (custom, 3+ channels) | Optimization/AI, not multi-channel dashboards |
| **TubeBuddy** | Per-creator license | Pro **$12/mo** | Legend **$26.39/mo** | Enterprise (custom) | **Multiple channels forces Enterprise** |
| **Metricool** | **Per "brand" (account bundle)** | Starter **$20/mo → 5 brands**, **$36/mo → 10** | Advanced **$53/mo → 15**, **$85 → 25** | **$159/mo → 50** | Closest comp; priced by # of profiles |
| **Social Blade** | Tiered + per-seat | ~$4/mo | ~$10–40/mo | $99/mo | Mostly public-stat tracking |
| **Hootsuite / Sprout** | Per-seat, many accounts | $99/mo / $199 seat | — | $$$ | Enterprise social suites |

**Key insight:** the market splits into *per-creator* (TubeBuddy/vidIQ — punish
multi-channel) and *per-account-bundle* (Metricool — reward it). **ReUnifyd's
wedge is being the affordable, multi-channel-native option** priced by channels.

### 6.2 Recommended pricing (proposal)

A **base tier + per-channel** model, with annual discount. Designed to undercut
Metricool's effective per-account cost while staying healthy.

| Plan | Channels | Monthly | Annual (≈2 mo free) | Target |
|---|---|---|---|---|
| **Free** | 1 channel | $0 | $0 | Try it, hobbyists |
| **Creator** | up to **3** | **$9/mo** | **$90/yr** | Portfolio creators |
| **Pro** | up to **10** | **$24/mo** | **$240/yr** | Serious operators |
| **Studio** | up to **25** | **$59/mo** | **$590/yr** | Networks / agencies |
| **Scale** | 25+ | Contact | Contact | MCNs |

**Add-on:** extra channels beyond a plan at **+$2/channel/mo** (mirrors Metricool's
$5/account but cheaper — our wedge).

**Why these numbers**
- Free 1-channel = frictionless acquisition (matches Metricool/vidIQ free tiers).
- Creator $9 < TubeBuddy Pro $12 and < Metricool $20, but allows **3 channels**
  (TubeBuddy would force Enterprise; Metricool free only gives 1).
- Pro $24/10ch ≈ Metricool $36/10 brands but ~33% cheaper, and we're analytics-focused.
- Effective cost/channel drops as you scale ($3 → $2.40 → $2.36), rewarding the
  exact users we want.

**v1 action:** monetization is **off**. Show this table on `/pricing` and the
sign-up Step 1, record the chosen plan, **bypass payment**, and enforce the
channel quota softly (warn, don't hard-block) until billing ships. Wire Stripe later.

> These numbers are a recommendation to **confirm** before we hard-code them.

---

## 7. Design direction

**Aesthetic:** YouTube-Studio-clean + Notion/Linear structure. Lots of whitespace,
soft borders, rounded-2xl cards, restrained shadows, one confident accent.

- **Theme (confirmed):** **red is the single accent**, on a **soft white** light
  theme and a **soft black** dark theme. Avoid harsh, eye-straining contrast — **no
  pure `#000`/`#fff` and no pure `#f00`**. Use off-white surfaces, near-black ink,
  and a refined (slightly desaturated) red. The previous blue accent (`#065fd4`) is
  fully retired.
  - Light: surfaces `#fbfbfa`/`#ffffff`, ink `#1a1a1a`, accent ≈ `#e0322e`.
  - Dark: surfaces `#0f0f10`/`#17171a`, ink `#f1f1ef`, accent ≈ `#f25a52` (brightened for contrast).
- **Type:** keep a clean grotesk (system/Geist/Inter). Fluid scale.
- **Components:** unify into a small design-system layer (Button, Card, KPIStat,
  Badge, Tabs, Toggle, Table, EmptyState, Skeleton, Modal, Tooltip) so both modes
  and future platforms reuse them.
- **Data viz:** consistent Recharts theme, color-blind-safe palette, per-platform
  colors (YT red-ish, IG gradient, TikTok cyan/magenta) used as *series accents only*.
- **Motion:** subtle, `prefers-reduced-motion` respected.

---

## 8. Implementation roadmap

Phased so we can ship and validate continuously, then "push everything once" per phase.

**Phase 0 — Foundations (enables everything)**
- Extract a small design-system component layer + tokens.
- Add **Simple/Advanced mode** context (provider + toggle + persistence).
- Add platform-awareness scaffolding (badges, scope picker shell).

**Phase 1 — Landing page**
- Rebuild `/` as the converting marketing site (§4.1) + `/pricing` (§6.2).

**Phase 2 — Auth & sign-up wizard**
- Login fast-path + show-password.
- Multi-step sign-up wizard (channel count → details → connect slots → done).
- Backend: `plan`/`channel_quota` on `User`, quota check at link time, disconnect
  endpoint + privacy copy. Payment feature-flagged off.

**Phase 3 — Dashboard redesign**
- New shell (sidebar/topbar/mode toggle/scope picker).
- Overview, Channel detail, Compare, Groups, Explore, Sync, Settings — each wired
  to Simple/Advanced. Reuse existing components, re-skinned.

**Phase 4 — Multi-platform groundwork**
- Platform filters + "coming soon" states; normalized metric vocabulary in the UI.

**Cross-cutting:** responsive + a11y pass each phase; run the full validation suite
(tsc, eslint, next build, ruff, pyflakes) before each push.

---

## 9. Decisions (confirmed 2026-06-09)

1. **Theme:** **white/black + red**, soft (non-harsh) contrast. Red is the only
   accent; blue retired. ✅
2. **Pricing:** proceed with Free / Creator $9 / Pro $24 / Studio $59 / Scale for
   now (treated as **provisional** — may be revised after deeper business-model
   work). Payments stay **off**; record plan + soft-enforce quota. ✅
3. **Sequencing:** **phase by phase** — Foundations → Landing → Auth → Dashboard. ✅
4. **First phase:** **Foundations + Landing page.** ✅
5. **Auth:** **scaffold 2FA** (optional now, full TOTP later); on disconnect,
   **retain metrics 30 days with one-click purge.** ✅
