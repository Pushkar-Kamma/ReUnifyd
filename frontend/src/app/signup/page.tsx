import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-[min(420px,92vw)] flex-1 flex-col justify-center py-16">
      <div className="card p-7">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">
          Create your account
        </h1>
        <p className="mb-6 text-sm text-[var(--ink-2)]">
          Start unifying your channels in minutes.
        </p>
        <form className="space-y-3">
          <input
            className="input-field"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
          <input
            className="input-field"
            type="text"
            placeholder="Username"
            autoComplete="username"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            autoComplete="new-password"
          />
          <button type="submit" className="btn primary w-full justify-center">
            Sign up
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
