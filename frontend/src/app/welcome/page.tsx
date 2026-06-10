"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { youtube, type Channel } from "@/lib/youtube";
import { apiUrl } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/auth-shell";

const WANT_CHANNELS_KEY = "reunifyd:onboarding:channels";

export default function WelcomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [want, setWant] = useState(3);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Require a session. If somebody lands here logged out, send them to sign up.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/signup");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(WANT_CHANNELS_KEY));
      if (saved >= 1 && saved <= 25) setWant(saved);
    } catch {
      // ignore
    }
  }, []);

  // Persist the chosen plan to the backend once we know the user is signed in.
  useEffect(() => {
    if (authLoading || !user) return;
    try {
      const saved = Number(window.localStorage.getItem(WANT_CHANNELS_KEY));
      if (saved >= 1 && saved <= 25) {
        void auth.setPlan(saved).catch(() => {});
      }
    } catch {
      // best effort
    }
  }, [authLoading, user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await youtube.channels();
      setChannels(res.channels);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function persistWant(n: number) {
    setWant(n);
    try {
      window.localStorage.setItem(WANT_CHANNELS_KEY, String(n));
    } catch {
      // ignore
    }
  }

  const connected = channels?.length ?? 0;
  const slots = Math.max(want, connected);
  const remaining = Math.max(0, want - connected);
  const overLimit = connected > want;
  const connectHref = apiUrl(`/auth/google/init?next=${encodeURIComponent("/welcome")}`);

  return (
    <AuthShell maxWidth={620}>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-7">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your channels</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          You planned for {want} {want === 1 ? "channel" : "channels"}. Connect
          each one with Google. You can do this now or later from the dashboard.
        </p>

        {/* count control */}
        <div className="mt-5 flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
          <span className="text-sm text-[var(--ink-2)]">Channels you want</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Fewer channels"
              onClick={() => persistWant(Math.max(1, want - 1))}
              disabled={want <= 1 || want <= connected}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-strong)] disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <span className="w-6 text-center text-lg font-semibold">{want}</span>
            <button
              type="button"
              aria-label="More channels"
              onClick={() => persistWant(Math.min(25, want + 1))}
              disabled={want >= 25}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-strong)] disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><line x1="12" y1="5" x2="12" y2="19" /></svg>
            </button>
          </div>
        </div>

        {/* over-limit notice */}
        {overLimit ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 text-sm">
            <div className="font-medium text-[var(--ink-1)]">
              You have connected {connected} channels but planned for {want}.
            </div>
            <p className="mt-1 text-[var(--ink-2)]">
              Either raise the number above, or remove a channel. To remove one,
              open it from the dashboard and choose Disconnect. We stop syncing
              right away, revoke our access token, and keep its data for 30 days
              so you can change your mind before it is deleted.
            </p>
          </div>
        ) : null}

        {/* slots */}
        <div className="mt-5 space-y-2.5">
          {loading ? (
            <div className="py-6 text-center text-sm text-[var(--ink-2)]">Loading your channels</div>
          ) : (
            Array.from({ length: slots }).map((_, i) => {
              const ch = channels?.[i];
              if (ch) {
                return <ConnectedSlot key={ch.id} channel={ch} />;
              }
              return <EmptySlot key={`empty-${i}`} index={i} href={connectHref} />;
            })
          )}
        </div>

        {/* actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-[var(--ink-3)]">
            {connected === 0
              ? "No channels connected yet"
              : `${connected} connected${remaining > 0 ? `, ${remaining} to go` : ""}`}
          </span>
          <div className="flex gap-3">
            {connected > 0 ? (
              <Link href="/dashboard" className="btn accent justify-center">
                Go to dashboard
              </Link>
            ) : (
              <Link href="/dashboard" className="btn justify-center">
                Skip for now
              </Link>
            )}
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-[var(--ink-3)]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Read only access. We never post, edit, or delete anything.
        </p>
      </div>
    </AuthShell>
  );
}

function ConnectedSlot({ channel }: { channel: Channel }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {channel.avatar_url ? (
          <Image
            src={channel.avatar_url}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
            {(channel.title || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{channel.title || "Channel"}</div>
          <div className="text-xs text-[var(--ink-3)]">
            {channel.subscriber_count != null
              ? `${channel.subscriber_count.toLocaleString()} subscribers`
              : "Connected"}
          </div>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ok)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Connected
      </span>
    </div>
  );
}

function EmptySlot({ index, href }: { index: number; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-3 transition hover:bg-[var(--bg-2)]"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-2)] text-sm font-semibold text-[var(--ink-3)]">
          {index + 1}
        </span>
        <span className="text-sm font-medium text-[var(--ink-2)]">Connect a channel</span>
      </div>
      <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.22V7.04H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
        </svg>
        Connect
      </span>
    </a>
  );
}
