"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await auth.signup({ email, password, name: name || undefined });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const body = err.body as { detail?: string } | undefined;
        setError(body?.detail || "Signup failed");
      } else {
        setError(err instanceof Error ? err.message : "Signup failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-[min(420px,92vw)] flex-1 flex-col justify-center py-16">
      <div className="card p-7">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="mb-6 text-sm text-[var(--ink-2)]">
          Start unifying your channels in minutes.
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
            type="text"
            placeholder="Your name (optional)"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password (8+ characters)"
            autoComplete="new-password"
            required
            minLength={8}
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
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--ink-2)]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)]">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}