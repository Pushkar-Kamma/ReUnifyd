"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { youtube, type Channel } from "@/lib/youtube";

export function DashboardSidebar() {
  const pathname = usePathname();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    youtube
      .channels()
      .then((r) => setChannels(r.channels))
      .catch(() => setChannels([]));
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-white/60 backdrop-blur md:block">
      <nav className="sticky top-[57px] flex flex-col gap-1 p-4 text-sm">
        <SidebarLink href="/dashboard" active={pathname === "/dashboard"}>
          Overview
        </SidebarLink>
        <SidebarLink
          href="/dashboard/channels"
          active={isActive("/dashboard/channels")}
        >
          Channels
        </SidebarLink>
        <SidebarLink
          href="/dashboard/groups"
          active={isActive("/dashboard/groups")}
        >
          Content groups
        </SidebarLink>

        {channels.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">
              Your channels
            </div>
            {channels.map((c) => (
              <SidebarLink
                key={c.id}
                href={`/dashboard/channels/${c.id}`}
                active={pathname === `/dashboard/channels/${c.id}`}
              >
                <span className="truncate">{c.title || "Untitled"}</span>
              </SidebarLink>
            ))}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-2 truncate rounded-lg px-3 py-2 transition",
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--ink-1)] hover:bg-[var(--bg-2)]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
