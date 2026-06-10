"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { auth } from "@/lib/auth";
import { ApiError, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthShell, PasswordField, GoogleButton } from "@/components/auth-shell";

const WANT_CHANNELS_KEY = "reunifyd:onboarding:channels";
const MAX_CHANNELS = 25;

type Plan = { name: string; monthly: number; annualPerMonth: number };

function planForChannels(n: number): Plan {
  if (n <= 1) return { name: "Free", monthly: 0, annualPerMonth: 0 };
  if (n <= 3) return { name: "Creator", monthly: 9, annualPerMonth: 7.5 };
  if (n <= 10) return { name: "Pro", monthly: 24, annualPerMonth: 20 };
  return { name: "Studio", monthly: 59, annualPerMonth: 49 };
}

function passwordScore(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const label = s <= 1 ? "Weak" : s === 2 ? "Fair" : s === 3 ? "Good" : "Strong";
  return { score: Math.min(s, 4), label };
}

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [channels, setChannels] = useState(3);
  const [annual, setAnnual] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => planForChannels(channels), [channels]);
  const strength = useMemo(() => passwordScore(password), [password]);
  const price = annual ? plan.annualPerMonth : plan.monthly;

  function continueToDetails() {
    try {
      window.localStorage.setItem(WANT_CHANNELS_KEY, String(channels));
    } catch {
      // ignore
    }
    setStep(2);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (!agree) {
      setError("Please accept the terms to continue.");
      return;
    }
    setSubmitting(true);
    try {
      await auth.signup({ email, password, name: name || undefined });
      try {
        window.localStorage.setItem("reunifyd:last-email", email);
      } catch {
        // ignore
      }
      await refresh();
      router.push("/welcome");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const body = err.body as { detail?: string } | undefined;
        setError(body?.detail || "That email is already registered.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Sign up failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const googleHref = apiUrl(`/auth/google/init?next=${encodeURIComponent("/welcome")}`);

  return (
    <AuthShell maxWidth={step === 1 ? 520 : 440}>
      <Stepper step={step} />

      {step === 1 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-7">
          <h1 className="text-2xl font-semibold tracking-tight">
            How many channels will you connect?
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            This sets your plan. You can change it any time, and everything is
            free while we are in early access.
          </p>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
            <div>
              <div className="text-sm text-[var(--ink-2)]">Channels</div>
              <div className="text-3xl font-semibold tracking-tight">{channels}</div>
            </div>
            <div className="flex items-center gap-2">
              <StepperButton
                label="Remove a channel"
                disabled={channels <= 1}
                onClick={() => setChannels((c) => Math.max(1, c - 1))}
                symbol="minus"
              />
              <StepperButton
                label="Add a channel"
                disabled={channels >= MAX_CHANNELS}
                onClick={() => setChannels((c) => Math.min(MAX_CHANNELS, c + 1))}
                symbol="plus"
              />
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={MAX_CHANNELS}
            value={channels}
            onChange={(e) => setChannels(Number(e.target.value))}
            aria-label="Number of channels"
            className="mt-4 w-full accent-[var(--accent)]"
          />

          <div className="mt-5 flex items-center justify-between rounded-xl bg-[var(--bg-2)] p-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold">{plan.name}</span>
                <span className="text-sm text-[var(--ink-2)]">plan</span>
              </div>
              <div className="mt-0.5 text-sm text-[var(--ink-2)]">
                {plan.name === "Free"
                  ? "No charge"
                  : `$${price}/mo ${annual ? "billed yearly" : "billed monthly"}`}
              </div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                className={`rounded-full px-2.5 py-1 font-medium transition ${!annual ? "bg-[var(--contrast)] text-[var(--on-contrast)]" : "text-[var(--ink-2)]"}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                className={`rounded-full px-2.5 py-1 font-medium transition ${annual ? "bg-[var(--contrast)] text-[var(--on-contrast)]" : "text-[var(--ink-2)]"}`}
              >
                Annual
              </button>
            </div>
          </div>

          <button onClick={continueToDetails} className="btn accent mt-6 w-full justify-center">
            Continue
          </button>
          <p className="mt-3 text-center text-xs text-[var(--ink-3)]">
            Payment is skipped during early access. We only remember your choice.
          </p>

          <p className="mt-6 text-center text-sm text-[var(--ink-2)]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
              Log in
            </Link>
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-7">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink-1)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>

          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            {plan.name} plan, {channels} {channels === 1 ? "channel" : "channels"}.
          </p>

          <div className="mt-6">
            <GoogleButton href={googleHref} label="Sign up with Google" />
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-[var(--ink-3)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            or with email
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <form onSubmit={onCreate} className="space-y-3">
            <input
              className="input-field"
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input-field"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="Create a password"
                autoComplete="new-password"
              />
              {password ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-1.5 flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-full"
                        style={{
                          background:
                            i < strength.score ? "var(--accent)" : "var(--border-strong)",
                        }}
                      />
                    ))}
                  </div>
                  <span className="w-12 text-right text-xs text-[var(--ink-3)]">
                    {strength.label}
                  </span>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                  Use at least 8 characters.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 pt-1 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                I agree to the Terms of Service and Privacy Policy. ReUnifyd uses
                read only access and never posts on my behalf.
              </span>
            </label>

            {error ? (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn accent w-full justify-center"
              disabled={submitting}
            >
              {submitting ? "Creating account" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--ink-3)]">
            Two factor authentication can be added later from settings.
          </p>
        </div>
      )}
    </AuthShell>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  const items = [
    { n: 1, label: "Choose plan" },
    { n: 2, label: "Account" },
    { n: 3, label: "Connect" },
  ];
  return (
    <ol className="mb-5 flex items-center justify-center gap-2 text-xs">
      {items.map((it, i) => {
        const active = it.n === step;
        const done = it.n < step;
        return (
          <li key={it.n} className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                background: active || done ? "var(--accent)" : "var(--bg-2)",
                color: active || done ? "#fff" : "var(--ink-3)",
              }}
            >
              {done ? "✓" : it.n}
            </span>
            <span className={active ? "font-medium text-[var(--ink-1)]" : "text-[var(--ink-3)]"}>
              {it.label}
            </span>
            {i < items.length - 1 ? (
              <span className="mx-1 h-px w-5 bg-[var(--border)]" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
  symbol,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  symbol: "plus" | "minus";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--ink-1)] transition hover:bg-[var(--bg-2)] disabled:opacity-40"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        {symbol === "plus" ? <line x1="12" y1="5" x2="12" y2="19" /> : null}
      </svg>
    </button>
  );
}