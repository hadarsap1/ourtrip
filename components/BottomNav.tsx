"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  CoinIcon,
  HomeIcon,
  type IconProps,
  JournalIcon,
  MapIcon,
  MessagesIcon,
  MoreIcon,
  PhotosIcon,
  BudgetIcon,
  DocumentIcon,
  RouteIcon,
} from "@/components/icons";
import { countUnread, subscribeMessages } from "@/lib/data/messages";
import { getActiveTrip } from "@/lib/data/trip";
import { strings } from "@/lib/strings";
import { useIsKidDevice } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";

type Tab = { href: string; label: string; Icon: ComponentType<IconProps> };

// Kid tablet variant: kid-relevant destinations only (cosmetic — kids are
// locked out of owner data by RLS regardless). Phrasebook stays reachable from
// the kid home tile.
const kidTabs: Tab[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/journal", label: strings.kidNav.journal, Icon: JournalIcon },
  { href: "/photos", label: strings.kidNav.photos, Icon: PhotosIcon },
  { href: "/messages", label: strings.kidNav.messages, Icon: MessagesIcon },
  { href: "/pocket", label: strings.kidNav.pocket, Icon: CoinIcon },
];

// Guest portal: only shared content + the family wall.
const guestTabs: Tab[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/photos", label: strings.guestNav.photos, Icon: PhotosIcon },
  { href: "/journal", label: strings.guestNav.journal, Icon: JournalIcon },
  { href: "/map", label: strings.guestNav.map, Icon: MapIcon },
  { href: "/messages", label: strings.guestNav.messages, Icon: MessagesIcon },
];

const ownerTabs: Tab[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/itinerary", label: strings.nav.itinerary, Icon: RouteIcon },
  { href: "/budget", label: strings.nav.budget, Icon: BudgetIcon },
  { href: "/documents", label: strings.nav.documents, Icon: DocumentIcon },
  { href: "/more", label: strings.nav.more, Icon: MoreIcon },
];

export function isTabActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const { member } = useMember();
  const isKid = useIsKidDevice();
  const role = member?.role ?? (isKid ? "kid" : "owner");
  const [unread, setUnread] = useState(0);

  // unread wall badge for kid/guest tabs; clears when the wall marks reads
  useEffect(() => {
    if (!member || member.role === "owner") return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const refreshBadge = async () => {
      const trip = await getActiveTrip();
      if (!trip || cancelled) return;
      const count = await countUnread(trip.id, member.id).catch(() => 0);
      if (!cancelled) setUnread(count);
    };

    void refreshBadge();
    const unsubscribe = subscribeMessages(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refreshBadge(), 500);
    });
    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [member, pathname]);

  if (pathname === "/kid-login" || pathname === "/login") return null;

  const tabs =
    role === "kid" ? kidTabs : role === "guest" ? guestTabs : ownerTabs;

  return (
    // Opaque, not paper/90 + blur: translucency muddies text over the warm
    // background. Hidden from lg up, where the side rail takes over.
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={strings.appName}
    >
      <ul className="flex items-start gap-0.5 px-1.5 pt-[9px] pb-3">
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href);
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
                  <tab.Icon
                    className="h-[23px] w-[23px]"
                    strokeWidth={1.7}
                  />
                  {tab.href === "/messages" && unread > 0 && (
                    <span className="absolute -left-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10.5px] leading-none tracking-[0.01em] ${
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
