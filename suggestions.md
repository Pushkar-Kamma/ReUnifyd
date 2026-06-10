# ReUnifyd — Audit & Suggestions

Exhaustive review of the frontend and backend after the Phase 4 redesign work.
Every item below was verified by reading the actual code (automated-scan false
positives were checked and are listed at the end so they are not re-investigated).

- **Date:** 2026-06-10
- **HEAD audited:** `0b81539`
- **Scope:** `frontend/` (Next.js) and `backend/` (FastAPI)

---

## Resolution status (updated 2026-06-10)

A first remediation pass landed the safe, non-breaking fixes. Each was validated
(tsc, eslint, next build, ruff, pyflakes) and pushed separately.

**Fixed**
- **C1** dev `/test/*` routes now registered only in dev/test environments; `/test/users`
  no longer returns raw `User` rows (no password hashes). (commit `a673671`)
- **H1** `/debug/oauth-config` gated out of production; unused `debug.py` deleted. (`a673671`)
- **H3** token decryption failures are now logged (distinguishable from a missing token). (`a673671`)
- **M2** `/auth/plan` input bounded with `Field(ge=1, le=25)`. (`a673671`)
- **M4 (partial) + H2 (partial)** token-refresh now raises a friendly "reconnect" message
  instead of leaking Google's raw response, and logs the real reason server-side to aid
  sync debugging. (`f454e16`)
- **M5** all hardcoded Tailwind palette colors (`emerald/amber/orange/lime/red/green/bg-white`)
  replaced with theme tokens; added `--ok-soft` / `--warn-soft` / `--danger-soft`. (`7c1ee82`)
- **M6** command-palette and empty-state emoji replaced with SVG icons; leftover anomaly-badge
  emoji removed. (`7c1ee82`)
- **L3** Dockerfile retries `alembic upgrade head` up to 5x on boot (rides out a waking DB),
  still exits non-zero if all attempts fail. (`39e876c`)
- **L6** period-switcher dropdown given `max-w-[90vw]`. (`7c1ee82`)

**Intentionally deferred** (riskier or judgment-dependent; not done in this pass)
- **H2 (full UI)** surfacing a dashboard "reconnect" banner when a channel's sync fails with
  `reason: "auth"` — this is the highest-value remaining item and the real fix for the
  reported sync failure, but it is a feature change spanning the sync response shape and the UI.
- **M1** refusing to start when CORS is `*` + credentials — a startup `raise` could crash boot
  if env is misconfigured; not currently exploitable (prod uses explicit origins).
- **M3** disconnect 30-day retention is still not enforced by a purge job (copy vs. job decision).
- **L1 / L2 / L5** narrowing bare excepts, moving to a lifespan handler, and raw-SQL→ORM are
  behavior-adjacent refactors left for a dedicated pass.
- **L4** the secondary chart-series blue (`#2563eb`) is kept as legitimate multi-series data-viz.

---


## 0. Build & validation status (all green)

| Check | Result |
|---|---|
| Frontend `tsc --noEmit` | PASS (exit 0) |
| Frontend ESLint (`--max-warnings=0`) | PASS (exit 0) |
| Frontend `next build` | PASS (17 routes) |
| Backend `ruff check .` | PASS |
| Backend `pyflakes` | PASS |
| Backend app import | PASS (50 routes) |
| Alembic heads | Single head `b2f4a1c9d3e7` (no branching) |
| Production API `/health` | 200 `{"status":"ok"}` |

The app builds and runs clean. The findings below are correctness, security, and
polish issues that the static tools do not catch.

---

## 1. Critical (fix before any real users)

### C1. Test endpoints are live in production with no auth or environment guard
- **Where:** [backend/app/main.py](backend/app/main.py#L127) registers the router; defined in [backend/app/api/test_db.py](backend/app/api/test_db.py#L1-L23).
- **What:** `app.include_router(test_db_router)` exposes:
  - `POST /test/seed` — creates a user with no authentication.
  - `GET /test/users` — returns `session.exec(select(User)).all()`, i.e. **full `User` rows**. Because SQLModel serializes every column, this includes `password_hash` and all emails for **every user in the database**.
- **Impact:** Anyone on the internet can enumerate all users and read password hashes. This is a serious data-exposure and account-takeover risk.
- **Fix:** Either delete `test_db.py` and its registration, or gate it:
  ```python
  # main.py, before registering
  if settings.ENVIRONMENT.lower() in {"dev", "development"}:
      app.include_router(test_db_router)
  ```
  And never return raw `User` objects; return `{"id", "email"}` only.

---

## 2. High

### H1. Unauthenticated debug config endpoint leaks OAuth/cookie configuration
- **Where:** [backend/app/main.py](backend/app/main.py#L139) — inline `@app.get("/debug/oauth-config")`.
- **What:** Returns `client_id_prefix`, `has_secret`, `redirect_url`, `cookie_secure`, `cookie_samesite` to any caller.
- **Impact:** Information disclosure that helps an attacker fingerprint and target the OAuth setup.
- **Fix:** Remove it, or guard behind `ENVIRONMENT` / `ADMIN_TOKEN` like [admin.py](backend/app/api/admin.py).

### H2. The known sync bug: failures are swallowed and never reach the user
- **Where:** [backend/app/services/sync.py](backend/app/services/sync.py#L48-L52) and the `/youtube/sync/all` background task in [backend/app/api/youtube.py](backend/app/api/youtube.py#L382-L390).
- **What:** When the OAuth refresh token is invalid/revoked, `sync_channel_daily` returns `{"ok": False, "reason": "auth", ...}`. For `POST /youtube/sync/all` this runs in a **background task**, so the HTTP response is an immediate `{"ok": true, "queued": [...]}` and the real failure is only logged server-side.
- **Most likely root cause of the current failure:** an **expired or revoked Google refresh token** (very common after the project sat idle and the DB was paused/resumed). The OAuth scopes are correct — [google_oauth.py](backend/app/services/google_oauth.py#L51-L55) already requests `yt-analytics.readonly` and `yt-analytics-monetary.readonly`, so this is **not** a missing-scope problem.
- **Impact:** User clicks "Sync all", sees success, nothing updates, no explanation. Matches the symptom you reported.
- **Fix:**
  1. Surface auth failures: have `/sync/all` return a per-channel status, or set a `needs_reconnect` flag on the channel that the UI reads.
  2. In the dashboard, when a channel reports `reason: "auth"`, show the existing "Reconnect required" banner with a connect link (the banner component already exists in [audience-insights.tsx](frontend/src/components/audience-insights.tsx)).
  3. For `POST /youtube/sync/daily` (foreground), return the structured error instead of a generic 200.

### H3. Decryption failures are silently treated as "no token"
- **Where:** [backend/app/services/token_helper.py](backend/app/services/token_helper.py) `_get_cached_access_token` (bare `except: return None`).
- **What:** If `FERNET_KEY` is ever rotated or a row is corrupted, every token "disappears" and users get auth errors with **no log line** explaining why.
- **Impact:** A key rotation would silently log out every connected channel with no diagnosable cause.
- **Fix:** Log the exception and distinguish "missing token" from "decryption failed" so key/rotation problems are visible.

---

## 3. Medium

### M1. CORS `*` fallback combined with credentials
- **Where:** [backend/app/main.py](backend/app/main.py#L45-L68) (CORS middleware).
- **What:** `allow_origins` falls back to `["*"]` while `allow_credentials=True`. The current production config uses explicit origins, so this is not currently exploitable, but if `CORS_ALLOW_ORIGINS` is ever set to `*`, browsers will silently drop the session cookie and auth breaks (and it is an insecure combination).
- **Fix:** Refuse to start (or drop credentials) when origins is `*`:
  ```python
  if "*" in origins and allow_credentials:
      raise RuntimeError("CORS: cannot combine allow_origins=['*'] with credentials")
  ```

### M2. `POST /auth/plan` accepts unbounded input
- **Where:** [backend/app/api/auth.py](backend/app/api/auth.py) `PlanIn.channels: int`.
- **What:** No bounds. `_plan_for_channels` clamps to 1..25 internally, so it is not a security hole, but a value like `-50` or `999999` is silently accepted with no validation error.
- **Fix:** `channels: int = Field(ge=1, le=25)` so Pydantic returns a clean 422.

### M3. Disconnect endpoint: retention claim is not enforced; possible orphans
- **Where:** [backend/app/api/youtube.py](backend/app/api/youtube.py) `DELETE /channels/{id}`.
- **What:** The response promises `data_retained_days: 30`, but there is no cleanup job that ever purges after 30 days — data is simply kept forever. Also, the `OAuthCredential` / `PlatformAccount` rows are not revisited when a channel is orphaned.
- **Fix:** Either implement a scheduled purge (APScheduler already runs) or change the copy to "retained until you delete your account". Consider revoking the Google token on disconnect.

### M4. Internal exception text leaked to clients
- **Where:** [backend/app/api/youtube.py](backend/app/api/youtube.py#L496-L503) — `raise HTTPException(401, detail=str(e))`.
- **What:** Raw `RuntimeError` messages (and potentially cryptography internals) are returned to the browser.
- **Fix:** Return a friendly message ("Reconnect your account") and log the detail.

### M5. Hardcoded colors that break dark mode and the red-only palette
The redesign standardized on soft white/black + red tokens, but several
**pre-existing** components still hardcode Tailwind palette colors. In dark mode
these render with wrong/!low-contrast backgrounds.
- `bg-white`: [period-switcher.tsx](frontend/src/components/period-switcher.tsx), [video-timeline.tsx](frontend/src/components/video-timeline.tsx), [videos-table.tsx](frontend/src/components/videos-table.tsx) sticky header.
- `text-emerald-*` / `bg-emerald-*`: [channel-health-score.tsx](frontend/src/components/channel-health-score.tsx), [channel-goals.tsx](frontend/src/components/channel-goals.tsx), [onboarding-checklist.tsx](frontend/src/components/onboarding-checklist.tsx), [title-pattern-insights.tsx](frontend/src/components/title-pattern-insights.tsx).
- `text-red-600` / `bg-red-600` / `bg-amber-*` / `text-orange-*`: [toast.tsx](frontend/src/components/toast.tsx), [notification-bell.tsx](frontend/src/components/notification-bell.tsx), [sync/page.tsx](frontend/src/app/dashboard/sync/page.tsx), [audience-insights.tsx](frontend/src/components/audience-insights.tsx), [ad-blocker-banner.tsx](frontend/src/components/ad-blocker-banner.tsx).
- **Fix:** Replace with `var(--ok)`, `var(--warn)`, `var(--danger)`, `var(--bg)`, `var(--accent)`. Consider adding `--ok-soft` / `--warn-soft` / `--danger-soft` tinted-surface tokens for the badge backgrounds.

### M6. Emoji still used as UI icons (sidebar was converted, these were missed)
- **Where:** [command-palette.tsx](frontend/src/components/command-palette.tsx#L20-L25) (`▦ 📺 🔗 ⇄ 🔭 ↻`) and [empty-state.tsx](frontend/src/components/empty-state.tsx) default `📊`.
- **Fix:** Reuse the SVG `Icon` pattern already built in [dashboard-sidebar.tsx](frontend/src/components/dashboard-sidebar.tsx).

---

## 4. Low

- **L1. Bare `except Exception:` clauses** in [auth.py](backend/app/api/auth.py) (ID-token parse) and token helper hide real errors. Narrow them and log at debug.
- **L2. Startup validation runs after the server is listening** ([main.py](backend/app/main.py) `@app.on_event("startup")`). Consider validating at import so a misconfigured deploy fails fast. Also `on_event` is deprecated in favor of lifespan handlers.
- **L3. Dockerfile migration has no retry** ([backend/Dockerfile](backend/Dockerfile)) — `alembic upgrade head && uvicorn ...`. A transient DB blip crashes the boot (this is what happened during the Supabase pause). A short retry loop would smooth transient outages:
  ```dockerfile
  CMD ["sh","-c","for i in 1 2 3 4 5; do alembic upgrade head && break; echo retry $i; sleep 5; done && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
  ```
- **L4. `#2563eb` blue secondary series color** in chart palettes ([dashboard/page.tsx](frontend/src/app/dashboard/page.tsx#L31), [compare/page.tsx](frontend/src/app/dashboard/compare/page.tsx), [explore/page.tsx](frontend/src/app/dashboard/explore/page.tsx)). It is a secondary multi-series accent (not the brand accent) so it is defensible, but if you want strict palette discipline, swap to a neutral or red-tinted ramp.
- **L5. Raw SQL via `sa.text()`** in [content_groups.py](backend/app/api/content_groups.py) and [sync.py](backend/app/services/sync.py) is **safe** (all parameters are bound, no string interpolation) but is more error-prone to maintain than the ORM. Optional refactor.
- **L6. `period-switcher` fixed `w-44`** could overflow on <360px screens; add `max-w-[90vw]`.

---

## 5. Suggested improvements (not bugs)

- **Surface "needs reconnect" globally.** Tie H2 together: a small banner on the dashboard when any channel's last sync failed with `reason: "auth"`, linking to reconnect. This single change makes the sync experience self-healing.
- **Harden the plan quota.** Quota is currently informational only. When billing is added, enforce it server-side at channel-link time (HTTP 402/409) — the `channel_quota` column is already there.
- **Add a real `platform` column** to `Channel`/`Video` responses so the new `platformOf()` helper and `PlatformBadge` light up automatically for Instagram/TikTok with zero UI changes.
- **Tests.** There is no automated test suite. A handful of pytest cases for auth (signup/login/rate-limit), the plan endpoint, and the IDOR guards would catch regressions cheaply.
- **Replace deprecated `@app.on_event`** with the FastAPI lifespan context manager.

---

## 6. Automated-scan false positives (verified, no action needed)

These were flagged by the automated review but are actually correct in the code —
documented so they are not re-investigated:

- **`welcome/page.tsx` `.toLocaleString()` "null crash"** — guarded: the code is `channel.subscriber_count != null ? ...toLocaleString() : "Connected"`. Safe.
- **`channel-goals.tsx` localStorage in render** — `loadGoals()` begins with `if (typeof window === "undefined") return [];` and is wrapped in try/catch. Safe.
- **`debug.py` endpoints (`/debug/googleaccounts`, `/debug/users`, `/debug/reset-refresh`)** — the router is **not registered** in `main.py`, so these are unreachable dead code. Still recommend deleting the file to avoid future accidental wiring, but they are not currently exposed. (The separate inline `/debug/oauth-config` in `main.py` **is** exposed — see H1.)
- **`dangerouslySetInnerHTML` in `layout.tsx`** — contains only a static, no-user-input theme-detection script. Safe; could use a clarifying comment.

---

## 7. Recommended order of work

1. **C1** — remove/guard `/test/*` (data exposure).
2. **H1** — remove/guard `/debug/oauth-config`; delete unused `debug.py`.
3. **H2** — surface sync auth failures + reconnect prompt (fixes the reported sync bug UX).
4. **H3 / M4** — log decryption failures, stop leaking exception text.
5. **M5 / M6** — dark-mode color tokens + emoji-to-SVG cleanup (visible polish).
6. **M1, M2, M3** — CORS guard, `/plan` bounds, disconnect retention copy/job.
7. **L-series** — bare excepts, Dockerfile retry, lifespan migration.
