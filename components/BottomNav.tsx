"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useSyncExternalStore } from "react";
import { NAV_CAPTURE_SLOT_ID } from "@/components/ui/Fab";
import { isEnabled } from "@/lib/flags";
import { isNavItemActive, tabsForRole } from "@/components/navItems";
import { totalPending } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { useIsKidDevice } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { useUnreadWall } from "@/lib/useUnreadWall";

const noopSubscribe = () => () => {};
// the capture button sits after this many tabs: היום, מסלול, [+], תקציב, תמונות, עוד
const CAPTURE_AFTER = 2;

/**
 * Columns that put the capture slot at the exact centre of the bar. With two
 * tabs before it and three after, equal-width tabs left it a slot off-centre
 * (Hadar 16/11/2026, from a phone). Each side gets the same total width: a tab
 * on the short side is as wide as the long side has tabs, and the other way
 * round - 2 x 3fr on one side, 3 x 2fr on the other.
 */
export function captureColumns(tabCount: number, before: number = CAPTURE_AFTER): string {
  const after = Math.max(tabCount - before, 0);
  if (before === 0 || after === 0) return `repeat(${Math.max(tabCount, 1)}, minmax(0, 1fr)) 3.5rem`;
  return `repeat(${before}, minmax(0, ${after}fr)) 3.5rem repeat(${after}, minmax(0, ${before}fr))`;
}

export function BottomNav() {
  const pathname = usePathname();
  const { member } = useMember();
  const isKid = useIsKidDevice();
  const captureOn = useSyncExternalStore(noopSubscribe, () => isEnabled("captureFab"), () => false);
  const role = member?.role ?? (isKid ? "kid" : "owner");
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

  if (pathname === "/kid-login" || pathname === "/login" || pathname === "/auth/confirm" || pathname.startsWith("/s/") || pathname.startsWith("/join/")) return null;

  const tabs = tabsForRole(role);
  // A parent's bar keeps a slot for the capture button, which renders itself
  // into it (components/ui/Fab.tsx) - in the bar it covers no content.
  const captureSlot = role === "owner" && captureOn;

  return (
    // Opaque, not paper/90 + blur: translucency muddies text over the warm
    // background. Hidden from lg up, where the side rail takes over. A flex
    // row under <main>, not position:fixed - see the body in app/layout.tsx.
    <nav
      className="relative z-50 shrink-0 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={strings.nav.bottomBarLabel}
    >
      <ul
        className={`items-start gap-0.5 px-1.5 pt-[7px] pb-2 ${captureSlot ? "grid" : "flex"}`}
        style={captureSlot ? { gridTemplateColumns: captureColumns(tabs.length) } : undefined}
      >
        {tabs.map((tab, index) => {
          const active = isNavItemActive(pathname, tab.href);
          return (
            <Fragment key={tab.href}>
            {captureSlot && index === CAPTURE_AFTER && <li id={NAV_CAPTURE_SLOT_ID} className="flex justify-center" />}
            <li className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                // the open tab is a filled pill (UI pass 15/11/2026): a 16px
                // underline and a bolder label were too quiet to find at a glance
                className={`flex flex-col items-center gap-[3px] rounded-2xl py-1.5 transition-colors ${
                  active ? "bg-sea-tint text-sea-deep" : "text-ink-faint"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-[23px] w-[23px]" strokeWidth={1.7} />
                  {tab.href === "/messages" && unread > 0 && (
                    <span className="absolute -end-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-xs font-bold text-on-alert">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                  {tab.href === "/photos" && photosWaiting > 0 && (
                    <span
                      className="absolute -end-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 text-xs font-bold text-on-alert"
                      role="status"
                      aria-label={strings.nav.photosWaiting.replace("{n}", String(photosWaiting))}
                    >
                      {photosWaiting > 9 ? "9+" : photosWaiting}
                    </span>
                  )}
                  {tab.href === "/photos" && photosHasNews && (
                    <span
                      className="absolute -end-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-alert"
                      role="status"
                      aria-label={strings.more.newFeedback}
                    />
                  )}
                  {tab.href === "/more" && moreHasNews && (
                    <span
                      className="absolute -end-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-alert"
                      role="status"
                      aria-label={strings.nav.moreHasNews}
                    />
                  )}
                </span>
                <span
                  className={`text-xs leading-none tracking-[0.01em] ${
                    active ? "font-bold" : "font-medium"
                  }`}
                >
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
