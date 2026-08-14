"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isKidDevice } from "@/lib/data/kids";
import { countUnread, subscribeMessages } from "@/lib/data/messages";
import { getActiveTrip } from "@/lib/data/trip";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

// Kid tablet variant: bigger touch targets, kid-relevant destinations only
// (cosmetic — kids are locked out of owner data by RLS regardless).
// Phrasebook stays reachable from the kid home tile.
const kidTabs = [
  { href: "/", label: strings.nav.today, emoji: "🏠" },
  { href: "/journal", label: strings.kidNav.journal, emoji: "📖" },
  { href: "/photos", label: strings.kidNav.photos, emoji: "📷" },
  { href: "/messages", label: strings.kidNav.messages, emoji: "💬" },
  { href: "/pocket", label: strings.kidNav.pocket, emoji: "🪙" },
];

// Guest portal: only shared content + the family wall.
const guestTabs = [
  { href: "/", label: strings.nav.today, emoji: "🏠" },
  { href: "/photos", label: strings.guestNav.photos, emoji: "📷" },
  { href: "/journal", label: strings.guestNav.journal, emoji: "📖" },
  { href: "/map", label: strings.guestNav.map, emoji: "🗺️" },
  { href: "/messages", label: strings.guestNav.messages, emoji: "💬" },
];

const tabs = [
  {
    href: "/",
    label: strings.nav.today,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
      />
    ),
  },
  {
    href: "/itinerary",
    label: strings.nav.itinerary,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
      />
    ),
  },
  {
    href: "/budget",
    label: strings.nav.budget,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
    ),
  },
  {
    href: "/documents",
    label: strings.nav.documents,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    ),
  },
  {
    href: "/more",
    label: strings.nav.more,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      />
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { member, memberLoading } = useMember();
  const role = member?.role ?? (isKidDevice() ? "kid" : "owner");
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

  // Until the member resolves we don't know whose nav this is, and the
  // fallback above is the owner's — so a guest on a slow connection would be
  // shown Budget and Documents and could tap in before it swaps (audit P-4).
  // Hold the bar empty instead. Only when a backend is actually configured:
  // with no Supabase env (local dev, e2e shell) the lookup never resolves to
  // anyone and the owner shell is the right thing to render.
  if (memberLoading && getSupabase()) {
    return (
      <nav
        aria-hidden="true"
        className="fixed bottom-0 inset-x-0 z-50 h-[3.75rem] border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      />
    );
  }

  if (role !== "owner") {
    const roleTabs = role === "kid" ? kidTabs : guestTabs;
    return (
      <nav
        className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label={strings.appName}
      >
        <ul className="flex justify-around px-1 pt-1.5">
          {roleTabs.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`mx-auto flex w-fit flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-sun-tint font-bold text-sea-deep"
                      : "text-ink-soft"
                  }`}
                >
                  <span className="relative text-2xl" aria-hidden="true">
                    {tab.emoji}
                    {tab.href === "/messages" && unread > 0 && (
                      <span className="absolute -left-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label={strings.appName}
    >
      <ul className="flex justify-around px-1 pt-1.5">
        {tabs.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`mx-auto flex w-fit flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-sun-tint font-semibold text-sea-deep"
                    : "text-ink-soft"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={active ? 2 : 1.5}
                  stroke="currentColor"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
