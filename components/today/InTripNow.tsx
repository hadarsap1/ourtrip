"use client";

import Link from "next/link";
import { JournalIcon } from "@/components/icons";
import { hhmm, homeClock, isEvening } from "@/lib/inTrip";
import { strings } from "@/lib/strings";

/**
 * The top of the in-trip home: the local / Israel clock pair and the evening
 * journal nudge. The "now" and "next" cards with their leave-by estimate
 * lived here too; the home no longer carries a plan by the hour (Hadar
 * 15/11/2026) - what was booked for today is listed by TodayScreen.
 */
export function InTripNow({
  now,
  clock,
  showClock = true,
}: {
  now: number;
  clock: Date;
  /** the parents' home shows the clocks in its progress card (קרם חם) */
  showClock?: boolean;
}) {
  const home = showClock ? homeClock(clock, now) : null;
  const evening = isEvening(now);
  if (!home && !evening) return null;

  return (
    <div className="space-y-2.5">
      {home && (
        <p className="flex justify-center gap-3 text-xs font-semibold text-ink-soft">
          <span>
            {strings.todayV2.localTime} <bdi className="tabular-nums text-ink">{hhmm(now)}</bdi>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {strings.todayV2.israelTime} <bdi className="tabular-nums text-ink">{home}</bdi>
          </span>
        </p>
      )}

      {evening && (
        <Link href="/stories" className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 shadow-card">
          <JournalIcon className="h-6 w-6 shrink-0 text-gold" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{strings.todayV2.eveningTitle}</span>
            <span className="block text-xs text-ink-soft">{strings.todayV2.eveningBody}</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-gold">{strings.todayV2.eveningCta}</span>
        </Link>
      )}
    </div>
  );
}
