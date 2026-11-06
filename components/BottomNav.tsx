"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, tabsForRole } from "@/components/navItems";
import { totalPending } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { useIsKidDevice } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { useUnreadWall } from "@/lib/useUnreadWall";

export function BottomNav() {
  const pathname = usePathname();
  const { member } = useMember();
  const isKid = useIsKidDevice();
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

  return (
    // Opaque, not paper/90 + blur: translucency muddies text over the warm
    // background. Hidden from lg up, where the side rail takes over. A flex
    // row under <main>, not position:fixed - see the body in app/layout.tsx.
    <nav
      className="relative z-50 shrink-0 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={strings.nav.bottomBarLabel}
    >
      <ul className="flex items-start gap-0.5 px-1.5 pt-[9px] pb-3">
        {tabs.map((tab) => {
          const active = isNavItemActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-[3px] rounded-xl py-0.5 transition-colors ${
                  active ? "text-sea-deep" : "text-ink-faint"
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
                {/* A sun underline instead of a filled blob: the blob read as a
                    selected chip and competed with the real chips on screen. */}
                <span
                  className={`h-[2.5px] w-4 rounded-full bg-sun transition-opacity duration-150 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
