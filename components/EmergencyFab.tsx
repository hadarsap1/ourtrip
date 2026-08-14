"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isKidDevice } from "@/lib/data/kids";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

/**
 * SPEC §2.12 asks for emergency access "in one tap from any screen". It lived
 * on the Today header and in /more, so from Budget, Map, Documents or Photos it
 * was two or three taps (audit S-2). This puts it in the shell.
 *
 * Sits above the bottom nav on the leading edge (RTL: right), away from the
 * thumb path of the tab bar so it can't be hit while switching tabs.
 *
 * Hidden for guests — the emergency page is family data they have no policy on,
 * and offering a button that opens an empty page is worse than not offering it.
 * Kids keep it: reaching a parent or an ambulance is the whole point.
 */
export function EmergencyFab() {
  const pathname = usePathname();
  const { member } = useMember();

  const hiddenRoute =
    pathname === "/emergency" ||
    pathname === "/login" ||
    pathname === "/kid-login" ||
    // Today (owner and kid variants) already carries a prominent SOS in its
    // header. Two on one screen is clutter; there is always exactly one.
    pathname === "/";
  if (hiddenRoute) return null;

  // Fails open on an unresolved member (offline, slow lookup): this is the one
  // control where showing it to someone who doesn't need it costs nothing and
  // hiding it from someone who does costs a great deal.
  const isGuest = member?.role === "guest";
  if (isGuest) return null;

  return (
    <Link
      href="/emergency"
      aria-label={strings.emergency.title}
      className={`fixed start-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid place-items-center rounded-full bg-rose-600 text-white shadow-lg ring-4 ring-paper/80 active:bg-rose-700 ${
        isKidDevice() ? "h-16 w-16 text-xl" : "h-14 w-14 text-lg"
      }`}
    >
      <span aria-hidden="true">🆘</span>
    </Link>
  );
}
