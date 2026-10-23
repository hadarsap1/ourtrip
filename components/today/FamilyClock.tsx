"use client";

import { countryName } from "@/lib/data/emergency";
import { familyClock, israelClock } from "@/lib/inTrip";
import { strings } from "@/lib/strings";

/** "בווייטנאם" - the country with its preposition, irregular names spelled out. */
export function inCountry(code: string): string {
  const up = code.toUpperCase();
  return strings.guestHome.inCountryExceptions[up] ?? strings.guestHome.inCountry.replace("{country}", countryName(up));
}

/** For guests in Israel (00069): the time where the family is today. Nothing when it would say nothing. */
export function GuestFamilyClock({ now, countryCode }: { now: Date; countryCode: string | null }) {
  const time = familyClock(now, countryCode);
  if (!time || !countryCode) return null;
  return (
    <p className="flex items-baseline justify-center gap-2 rounded-[18px] border border-sv-line bg-sv-card px-4 py-2.5 text-sm text-sv-ink-soft">
      <span>{strings.guestHome.familyTime.replace("{where}", inCountry(countryCode))}</span>
      <bdi className="text-xl font-extrabold tabular-nums text-sv-ink">{time}</bdi>
    </p>
  );
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
