"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { auth } from "@/lib/auth";
import { ApiError, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthShell, PasswordField, GoogleButton } from "@/components/auth-shell";

const LAST_EMAIL_KEY = "reunifyd:last-email";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const { user, loading, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remembered, setRemembered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fast path: if a session already exists, skip the form entirely.
  useEffect(() => {
    if (!loading && user) {
      router.replace(next);
    }
  }, [loading, user, next, router]);

  // Pre-fill a remembered email so returning users only type a password.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRemembered(true);
      }
    } catch {
      // ignore
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.login({ email, password });
      try {
        window.localStorage.setItem(LAST_EMAIL_KEY, email);
      } catch {
        // ignore
      }
      await refresh();
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("That email and password do not match.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function useDifferentAccount() {
    setRemembered(false);
    setEmail("");
    setPassword("");
    try {
      window.localStorage.removeItem(LAST_EMAIL_KEY);
    } catch {
      // ignore
    }
  }

  const googleHref = apiUrl(`/auth/google/init?next=${encodeURIComponent(next)}`);

  return (
    <AuthShell>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-7">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          Log in to open your dashboard.
        </p>

        <div className="mt-6">
          <GoogleButton href={googleHref} label="Continue with Google" />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-[var(--ink-3)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or with email
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {remembered ? (
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs text-[var(--ink-3)]">Signed in before as</div>
                <div className="truncate text-sm font-medium">{email}</div>
              </div>
              <button
                type="button"
                onClick={useDifferentAccount}
                className="ml-3 flex-shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Not you?
              </button>
            </div>
          ) : (
            <input
              className="input-field"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          <PasswordField
            value={password}
            onChange={setPassword}
            placeholder="Password"
            autoComplete="current-password"
          />

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
            {submitting ? "Logging in" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--ink-2)]">
          New to ReUnifyd?{" "}
          <Link href="/signup" className="font-medium text-[var(--accent)] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-16 text-center text-[var(--ink-2)]">Loading</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
