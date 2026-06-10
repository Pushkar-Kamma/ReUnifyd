"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { youtube, type Channel } from "@/lib/youtube";
import { useDashboardMode } from "@/lib/dashboard-mode";

type IconName = "overview" | "compare" | "channels" | "groups" | "explore" | "sync";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "overview":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "compare":
      return (
        <svg {...common}>
          <line x1="6" y1="20" x2="6" y2="11" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="18" y1="20" x2="18" y2="14" />
        </svg>
      );
    case "channels":
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="m17 2-5 5-5-5" />
        </svg>
      );
    case "groups":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "explore":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "sync":
      return (
        <svg {...common}>
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      );
  }
}

export function DashboardSidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void } = {}) {
  const pathname = usePathname();
  const { isAdvanced } = useDashboardMode();
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
          "w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]",
          "md:block",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 block md:static"
            : "hidden",
        ].join(" ")}
      >
        <nav className="sticky top-[61px] flex flex-col gap-0.5 py-3 text-sm">
          <SidebarLink href="/dashboard" active={pathname === "/dashboard"} icon="overview">
            Overview
          </SidebarLink>
          <SidebarLink
            href="/dashboard/compare"
            active={isActive("/dashboard/compare")}
            icon="compare"
          >
            Compare
          </SidebarLink>
          <SidebarLink
            href="/dashboard/channels"
            active={pathname === "/dashboard/channels"}
            icon="channels"
          >
            Channels
          </SidebarLink>
          <SidebarLink
            href="/dashboard/groups"
            active={isActive("/dashboard/groups")}
            icon="groups"
          >
            Content groups
          </SidebarLink>
          {isAdvanced ? (
            <SidebarLink
              href="/dashboard/explore"
              active={isActive("/dashboard/explore")}
              icon="explore"
            >
              Explore
            </SidebarLink>
          ) : null}
          <SidebarLink
            href="/dashboard/sync"
            active={isActive("/dashboard/sync")}
            icon="sync"
          >
            Sync status
          </SidebarLink>

          {channels.length > 0 ? (
            <>
              <div className="mt-5 mb-1 px-5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
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
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "mx-2 flex items-center gap-3 truncate rounded-lg px-3 py-2 transition",
        active
          ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
          : "text-[var(--ink-1)] hover:bg-[var(--bg-2)]",
      ].join(" ")}
    >
      <span className="shrink-0 opacity-90">
        <Icon name={icon} />
      </span>
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
          ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
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
