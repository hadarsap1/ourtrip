"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { isEnabled } from "@/lib/flags";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

// SOS one tap away on every phone screen (Hadar 25/11/2026, amends #56): a
// thin (44px) strip above the screen, so it covers none of the screens' own header
// buttons. Not on Today and the kid home ("/"), whose place band carries SOS
// already, nor on the emergency page itself. Parents and kids only - guests
// have no emergency page (RoleGate). Phones only: the desktop rail lists it.
// The page opens offline (rule 6), so the link is always worth showing.

const HIDDEN_ON = ["/emergency", "/login", "/auth/", "/kid-login", "/offline", "/s/", "/join/", "/email-off/"];
const noop = () => () => {};

export function SosStrip() {
  const on = useSyncExternalStore(noop, () => isEnabled("sosStrip"), () => false);
  const pathname = usePathname() ?? "/";
  const { member } = useMember();
  const role = member?.role;
  if (!on || (role !== "owner" && role !== "kid")) return null;
  if (pathname === "/" || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="flex h-11 shrink-0 items-center justify-end border-b border-line bg-paper px-3 lg:hidden">
      <Link
        href="/emergency"
        aria-label={strings.emergency.sosStripLabel}
        className="flex min-h-[36px] min-w-[56px] items-center justify-center rounded-full bg-alert px-3 text-xs font-extrabold tracking-[0.06em] text-on-alert active:opacity-90"
      >
        {strings.emergency.sos}
      </Link>
    </div>
  );
}
