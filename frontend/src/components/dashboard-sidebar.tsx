"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { youtube, type Channel } from "@/lib/youtube";

const ICONS = {
  overview: "▦",
  compare: "⇄",
  channels: "📺",
  groups: "🔗",
  explore: "🔭",
  sync: "↻",
};

export function DashboardSidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const pathname = usePathname();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    youtube
      .channels()
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, []);

  // Close drawer on route change
  useEffect(() => {
    if (mobileOpen) onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={[
          "w-64 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]",
          "md:block",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 block md:static"
            : "hidden",
        ].join(" ")}
      >
      <nav className="sticky top-[57px] flex flex-col gap-0.5 py-3 text-sm">
        <SidebarLink
          href="/dashboard"
          active={pathname === "/dashboard"}
          icon={ICONS.overview}
        >
          Overview
        </SidebarLink>
        <SidebarLink
          href="/dashboard/compare"
          active={isActive("/dashboard/compare")}
          icon={ICONS.compare}
        >
          Compare
        </SidebarLink>
        <SidebarLink
          href="/dashboard/channels"
          active={pathname === "/dashboard/channels"}
          icon={ICONS.channels}
        >
          Channels
        </SidebarLink>
        <SidebarLink
          href="/dashboard/groups"
          active={isActive("/dashboard/groups")}
          icon={ICONS.groups}
        >
          Content groups
        </SidebarLink>
        <SidebarLink
          href="/dashboard/explore"
          active={isActive("/dashboard/explore")}
          icon={ICONS.explore}
        >
          Advanced mode
        </SidebarLink>
        <SidebarLink
          href="/dashboard/sync"
          active={isActive("/dashboard/sync")}
          icon={ICONS.sync}
        >
          Sync status
        </SidebarLink>

        {channels.length > 0 ? (
          <>
            <div className="mt-5 mb-1 px-4 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Your channels
            </div>
            {channels.map((c) => (
              <ChannelLink
                key={c.id}
                channel={c}
                active={pathname === `/dashboard/channels/${c.id}`}
              />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
    </>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "mx-2 flex items-center gap-3 truncate rounded-lg px-3 py-2 transition",
        active
          ? "bg-[var(--bg-2)] font-semibold text-[var(--ink-1)]"
          : "text-[var(--ink-1)] hover:bg-[var(--bg-2)]",
      ].join(" ")}
    >
      {icon ? (
        <span className="w-5 shrink-0 text-center text-[15px] opacity-80">{icon}</span>
      ) : null}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function ChannelLink({
  channel,
  active,
}: {
  channel: Channel;
  active: boolean;
}) {
  return (
    <Link
      href={`/dashboard/channels/${channel.id}`}
      className={[
        "mx-2 flex items-center gap-2.5 truncate rounded-lg px-3 py-2 transition",
        active
          ? "bg-[var(--bg-2)] font-semibold text-[var(--ink-1)]"
          : "text-[var(--ink-1)] hover:bg-[var(--bg-2)]",
      ].join(" ")}
    >
      {channel.avatar_url ? (
        <Image
          src={channel.avatar_url}
          alt=""
          width={20}
          height={20}
          unoptimized
          className="h-5 w-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--bg-2)] text-[10px] font-bold text-[var(--ink-2)]">
          {(channel.title || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate">{channel.title || "Untitled"}</span>
    </Link>
  );
}
