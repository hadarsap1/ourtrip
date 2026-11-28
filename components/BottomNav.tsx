"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useSyncExternalStore } from "react";
import { NAV_CAPTURE_SLOT_ID } from "@/components/ui/Fab";
import { isEnabled } from "@/lib/flags";
import { isNavItemActive, tabsForRole } from "@/components/navItems";
import { totalPending } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { useDeviceRole } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { useUnreadWall } from "@/lib/useUnreadWall";

const noopSubscribe = () => () => {};
// the capture button sits after this many tabs: היום, מסלול, [+], תקציב, תמונות, עוד
const CAPTURE_AFTER = 2;

/**
 * Every slot of the bar the same width, the capture button's included, so the
 * tabs are evenly spaced (Hadar 24/11/2026). With two tabs before it and
 * three after, that puts the button half a slot off the exact centre - the
 * price of even spacing. (16/11 to 24/11 it was centred, with 3fr tabs on
 * one side and 2fr on the other, which crowded the floating bar's left end.)
 */
export function captureColumns(tabCount: number): string {
  return `repeat(${Math.max(tabCount, 0) + 1}, minmax(0, 1fr))`;
}

export function BottomNav() {
  const pathname = usePathname();
  const { member } = useMember();
  const deviceRole = useDeviceRole();
  const captureOn = useSyncExternalStore(noopSubscribe, () => isEnabled("captureFab"), () => false);
  const role = member?.role ?? deviceRole;
  const unread = useUnreadWall();
  // A parent's chat sits behind "עוד", as do the approval queues and the
  // likes and comments: one dot on that tab says something new is waiting
  // inside (Hadar 04/11/2026).
  const ownerTrip = role === "owner" && member ? member.trip_id : null;
  const pending = usePendingApprovals(ownerTrip, pathname);
  const fresh = useNewFeedback(ownerTrip, pathname);
  // Photos have a tab of their own (UX pass 06/11/2026): their queue and
  // their new likes show there, and "עוד" carries only what lives inside it.
  const photosWaiting = role === "owner" && pending ? pending.photos : 0;
  const photosHasNews = role === "owner" && photosWaiting === 0 && fresh.photos > 0;
  const moreHasNews =
    role === "owner" &&
    (unread > 0 ||
      (pending ? totalPending(pending) - pending.photos > 0 : false) ||
      fresh.stories + fresh.episodes > 0);

  if (pathname === "/kid-login" || pathname === "/login" || pathname === "/auth/confirm" || pathname.startsWith("/s/") || pathname.startsWith("/join/") || pathname.startsWith("/email-off/")) return null;

  const tabs = tabsForRole(role);
  // A parent's bar keeps a slot for the capture button, which renders itself
  // into it (components/ui/Fab.tsx) - in the bar it covers no content.
  const captureSlot = role === "owner" && captureOn;

  return (
    // A floating capsule (קרם חם, 24/11/2026). Absolute in the body, not
    // position:fixed: the body never scrolls and is one screen tall, so this
    // pins to the bottom exactly like fixed did, without the iOS WebKit drift
    // that a fixed bar had (see the body in app/layout.tsx). <main> scrolls
    // under it with --nav-room of bottom padding. Hidden from lg up, where
    // the side rail takes over.
    <nav
      className="absolute inset-x-3 bottom-[calc(18px+env(safe-area-inset-bottom))] z-50 h-[70px] rounded-[28px] border border-line bg-surface/96 px-1 shadow-nav lg:hidden"
      aria-label={strings.nav.bottomBarLabel}
    >
      <ul
        className={`h-full items-center ${captureSlot ? "grid" : "flex justify-around gap-0.5"}`}
        style={captureSlot ? { gridTemplateColumns: captureColumns(tabs.length) } : undefined}
      >
        {tabs.map((tab, index) => {
          const active = isNavItemActive(pathname, tab.href);
          const dot =
            (tab.href === "/messages" && unread > 0) ||
            (tab.href === "/photos" && photosHasNews) ||
            (tab.href === "/more" && moreHasNews);
          const dotLabel =
            tab.href === "/messages"
              ? strings.nav.unreadMessages
              : tab.href === "/photos"
                ? strings.more.newFeedback
                : strings.nav.moreHasNews;
          return (
            <Fragment key={tab.href}>
            {captureSlot && index === CAPTURE_AFTER && <li id={NAV_CAPTURE_SLOT_ID} className="flex justify-center" />}
            <li className="flex min-w-0 flex-1 justify-center">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                // the open tab is a filled green pill: a shape, not only a colour
                // px-0.5: at 360 with the centred capture slot a trailing tab is ~45px,
                // and "תמונות" needs 40 of it
                className={`flex h-[54px] w-full max-w-[76px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-0.5 transition-colors ${
                  active ? "bg-green text-on-green" : "text-nav-idle"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 2} />
                  {dot && (
                    <span
                      className="absolute -end-1 -top-0.5 h-[9px] w-[9px] rounded-full bg-coral ring-2 ring-surface"
                      role="status"
                      aria-label={dotLabel}
                    />
                  )}
                  {tab.href === "/photos" && photosWaiting > 0 && (
                    <span
                      className="absolute -end-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-xs font-bold text-on-coral ring-2 ring-surface"
                      role="status"
                      aria-label={strings.nav.photosWaiting.replace("{n}", String(photosWaiting))}
                    >
                      {photosWaiting > 9 ? "9+" : photosWaiting}
                    </span>
                  )}
                </span>
                <span className={`max-w-full truncate text-xs leading-4 ${active ? "font-bold" : "font-medium"}`}>
                  {tab.label}
                </span>
              </Link>
            </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
