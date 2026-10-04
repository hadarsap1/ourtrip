"use client";

import Link from "next/link";
import { ExternalIcon, JournalIcon } from "@/components/icons";
import { navigationUrl } from "@/lib/data/map";
import { formatTime } from "@/lib/format";
import { hhmm, homeClock, isEvening, leaveByMinutes, type LatLng } from "@/lib/inTrip";
import { currentItemId, nextUp } from "@/lib/tripDay";
import { strings } from "@/lib/strings";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

const at = (o: { lat: number | null; lng: number | null } | null | undefined): LatLng | null =>
  o && o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null;

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

function countdown(minutes: number): string {
  if (minutes < 1) return strings.today.nowLabel;
  if (minutes < 60) return strings.today.inMinutes.replace("{n}", String(minutes));
  return strings.today.inHours.replace("{n}", String(Math.round(minutes / 60)));
}

function NavigateLink({ to }: { to: LatLng }) {
  return (
    <a
      href={navigationUrl(to.lat, to.lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sea px-3.5 text-sm font-bold text-on-sea"
    >
      {strings.todayV2.navigate}
      <ExternalIcon className="h-4 w-4" />
    </a>
  );
}

/**
 * In-trip Today, v2 (1.6): the "now" and "next" cards with a leave-by estimate
 * and a navigate button, the local/Israel clock pair, and the evening journal
 * nudge. Everything here derives from today's snapshot, so it works offline;
 * navigation hands off to the maps app.
 */
export function InTripNow({ items, day, now, clock }: { items: ItineraryItem[]; day: ItineraryDay | null; now: number; clock: Date }) {
  const currentId = currentItemId(items, now);
  const current = items.find((i) => i.id === currentId) ?? null;
  const currentEnd = minutesOf(current?.end_time ?? null);
  // A current item without an end time stays "now" until the next one starts.
  const showNow = current && (currentEnd === null || currentEnd > now) ? current : null;
  const upcoming = nextUp(items, now);

  // Leave from where we are: the current item, else the last place we were
  // today, else the day's base (usually the hotel area).
  const past = items
    .filter((i) => (minutesOf(i.start_time) ?? Infinity) <= now && at(i))
    .sort((a, b) => (minutesOf(b.start_time) ?? 0) - (minutesOf(a.start_time) ?? 0));
  const origin = at(showNow) ?? at(past[0]) ?? at(day);
  const target = upcoming ? at(upcoming.item) : null;
  const startMin = upcoming ? minutesOf(upcoming.item.start_time) : null;
  const leaveBy = startMin !== null ? leaveByMinutes(startMin, origin, target) : null;
  const leaveNow = leaveBy !== null && leaveBy <= now;

  const home = homeClock(clock, now);

  return (
    <div className="space-y-2.5">
      {home && (
        <p className="flex justify-center gap-3 text-[12px] font-semibold text-ink-soft">
          <span>
            {strings.todayV2.localTime} <bdi className="tabular-nums text-ink">{hhmm(now)}</bdi>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {strings.todayV2.israelTime} <bdi className="tabular-nums text-ink">{home}</bdi>
          </span>
        </p>
      )}

      {showNow && (
        <section className="rounded-[18px] border-[1.5px] border-sea bg-sea-tint px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="ot-kicker text-sea-deep">{strings.todayV2.nowTitle}</p>
            {showNow.end_time && (
              <span className="text-[12px] font-semibold text-sea-deep">
                {strings.todayV2.until.replace("{time}", formatTime(showNow.end_time))}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold text-ink">{showNow.title}</p>
              {showNow.location_name && <p className="truncate text-[12px] text-ink-soft">{showNow.location_name}</p>}
            </div>
            {at(showNow) && <NavigateLink to={at(showNow) as LatLng} />}
          </div>
        </section>
      )}

      {upcoming ? (
        <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3 shadow-[var(--e1)]">
          <div className="flex items-baseline justify-between gap-2">
            <p className="ot-kicker">{strings.todayV2.nextTitle}</p>
            <span className="text-[12px] font-medium text-ink-soft">{countdown(upcoming.minutesUntil)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-baseline gap-2.5">
                <bdi className="shrink-0 text-[15px] font-extrabold tabular-nums text-sea">
                  {upcoming.item.start_time ? formatTime(upcoming.item.start_time) : ""}
                </bdi>
                <span className="min-w-0 truncate text-[16.5px] font-bold text-ink">{upcoming.item.title}</span>
              </p>
              {upcoming.item.location_name && <p className="mt-0.5 truncate text-[12px] text-ink-soft">{upcoming.item.location_name}</p>}
            </div>
            {target && <NavigateLink to={target} />}
          </div>
          {leaveBy !== null && (
            <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${leaveNow ? "bg-warning-soft text-warning" : "bg-paper-deep text-ink"}`}>
              {leaveNow ? strings.todayV2.leaveNow : strings.todayV2.leaveBy.replace("{time}", hhmm(leaveBy))}
              <span className="font-medium text-ink-soft"> · {strings.todayV2.leaveByHint}</span>
            </p>
          )}
        </section>
      ) : (
        items.length > 0 && <p className="rounded-[18px] bg-paper-deep px-3.5 py-3 text-center text-sm font-semibold text-ink-soft">{strings.todayV2.nothingLeft}</p>
      )}

      {isEvening(now) && (
        <Link href="/journal" className="flex items-center gap-3 rounded-[18px] bg-gold/10 px-3.5 py-3">
          <JournalIcon className="h-6 w-6 shrink-0 text-gold" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{strings.todayV2.eveningTitle}</span>
            <span className="block text-[12px] text-ink-soft">{strings.todayV2.eveningBody}</span>
          </span>
          <span className="shrink-0 text-[12px] font-bold text-gold">{strings.todayV2.eveningCta}</span>
        </Link>
      )}
    </div>
  );
}
