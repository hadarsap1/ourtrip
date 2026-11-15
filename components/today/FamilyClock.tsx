"use client";

import { countryName } from "@/lib/data/emergency";
import { israelClock } from "@/lib/inTrip";
import { strings } from "@/lib/strings";

/** "בווייטנאם" - the country with its preposition, irregular names spelled out. */
export function inCountry(code: string): string {
  const up = code.toUpperCase();
  return strings.guestHome.inCountryExceptions[up] ?? strings.guestHome.inCountry.replace("{country}", countryName(up));
}

/** For the kids, always: what time it is for the friends at home. */
export function KidIsraelClock({ now }: { now: Date }) {
  return (
    <p className="mt-1.5 flex items-baseline gap-2 text-sm opacity-90">
      <span>{strings.kidHome.israelTime}</span>
      <bdi className="text-lg font-bold tabular-nums">{israelClock(now)}</bdi>
    </p>
  );
}
