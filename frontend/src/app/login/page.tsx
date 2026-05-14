import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-[min(420px,92vw)] flex-1 flex-col justify-center py-16">
      <div className="card p-7">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mb-6 text-sm text-[var(--ink-2)]">
          Log in to your ReUnifyd dashboard.
        </p>
        <form className="space-y-3">
          <input
            className="input-field"
            type="text"
            placeholder="Email or username"
            autoComplete="username"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
          />
          <button type="submit" className="btn primary w-full justify-center">
            Log in
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
