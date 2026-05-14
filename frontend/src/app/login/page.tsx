"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.login({ email, password });
      await refresh();
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-[min(420px,92vw)] flex-1 flex-col justify-center py-16">
      <div className="card p-7">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mb-6 text-sm text-[var(--ink-2)]">
          Log in to your ReUnifyd dashboard.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="input-field"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          ) : null}
          <button
            type="submit"
            className="btn primary w-full justify-center"
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--ink-2)]">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-[var(--accent)]">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-6 py-16 text-center text-[var(--ink-2)]">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
