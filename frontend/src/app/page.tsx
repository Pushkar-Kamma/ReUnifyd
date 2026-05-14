import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            ReUnifyd
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="hover:underline">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          One dashboard for every channel you run.
        </h1>
        <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
          ReUnifyd unifies your YouTube, Instagram, and TikTok analytics so you
          can compare the same content across platforms — side by side.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Get started
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-300 px-5 py-2.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            View dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
