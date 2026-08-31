"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavItemActive,
  ownerRailMemories,
  ownerTabs,
  tabsForRole,
  type NavItem,
} from "@/components/navItems";
import { strings } from "@/lib/strings";
import { useIsKidDevice } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";
import { useUnreadWall } from "@/lib/useUnreadWall";

function RailRow({
  item,
  active,
  compact = false,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-[11px] rounded-[13px] px-3 transition-colors ${
        compact ? "py-[9px]" : "py-2.5"
      } ${
        active
          ? "bg-white font-bold text-sea-deep"
          : "font-medium text-ink-soft hover:bg-white/60"
      }`}
    >
      <span className="relative shrink-0">
        <item.Icon className="h-5 w-5" strokeWidth={1.7} />
        {badge > 0 && (
          <span className="absolute -left-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="truncate text-sm">{item.label}</span>
    </Link>
  );
}

/**
 * Desktop navigation. From `lg` up the bottom tab bar is replaced by this rail
 * pinned to the inline-start edge (the right, in RTL), so the content column no
 * longer sits as a 512px strip in the middle of an empty viewport.
 *
 * Owners get the full map — the four primary destinations, the memory
 * destinations that hide behind "עוד" on mobile, and the emergency page. Kids
 * and guests get exactly the tabs their bottom bar already shows and nothing
 * more; the rail is extra room, not extra access.
 */
export function SideRail() {
  const pathname = usePathname();
  const { member } = useMember();
  const isKid = useIsKidDevice();
  const role = member?.role ?? (isKid ? "kid" : "owner");
  const unread = useUnreadWall();

  if (pathname === "/kid-login" || pathname === "/login") return null;

  const isOwner = role === "owner";
  const primary = isOwner
    ? ownerTabs.filter((t) => t.href !== "/more")
    : tabsForRole(role);

  return (
    <nav
      // border-e is the rail's content-facing edge in RTL.
      className="fixed inset-y-0 start-0 z-40 hidden w-[216px] flex-col gap-[26px] overflow-y-auto border-e border-line bg-[#f7f1e6] px-[18px] py-[26px] lg:flex"
      aria-label={strings.nav.railLabel}
    >
      <div className="flex items-center gap-[9px] ps-1.5">
        <span
          className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-sea text-xs font-extrabold text-white"
          aria-hidden="true"
        >
          OT
        </span>
        <span className="text-sm font-extrabold tracking-[0.02em] text-sea-deep">
          {strings.appName}
        </span>
      </div>

      <div className="flex flex-col gap-[3px]">
        {primary.map((item) => (
          <RailRow
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
            badge={item.href === "/messages" ? unread : 0}
          />
        ))}
      </div>

      {isOwner && (
        <>
          <div className="h-px bg-line" aria-hidden="true" />
          <div className="flex flex-col gap-[3px]">
            <p className="ot-kicker px-3 pb-1.5">{strings.more.groupMemories}</p>
            {ownerRailMemories.map((item) => (
              <RailRow
                key={item.href}
                item={item}
                active={isNavItemActive(pathname, item.href)}
                compact
              />
            ))}
          </div>

          <Link
            href="/emergency"
            className="mt-auto flex items-center gap-2.5 rounded-[13px] bg-alert-tint px-3 py-[11px] text-alert"
          >
            <span
              className="rounded-md border-[1.4px] border-alert/35 px-[5px] py-0.5 text-[10px] font-extrabold tracking-[0.06em]"
              aria-hidden="true"
            >
              {strings.emergency.sos}
            </span>
            <span className="text-[13.5px] font-bold">
              {strings.more.menuEmergency}
            </span>
          </Link>
        </>
      )}
    </nav>
  );
}
