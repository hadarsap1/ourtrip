"use client";

import {
  BedIcon,
  CalendarIcon,
  ChevronDownIcon,
  PlusIcon,
  SparkleIcon,
} from "@/components/icons";
import { countryName } from "@/lib/data/emergency";
import { formatShortDate, formatWeekdayNarrow } from "@/lib/format";
import type { LegOverview } from "@/lib/itineraryOverview";
import { strings } from "@/lib/strings";
import { isEnabled } from "@/lib/flags";
import { groupEmptyRuns } from "@/lib/emptyRuns";
import { flagEmoji } from "@/lib/countries";
import { useState } from "react";
import type { ItineraryDay } from "@/lib/types";

/**
 * One leg of the trip: a summary row that is readable shut, and the leg's days
 * when it is open.
 *
 * WHY SHUT BY DEFAULT. The list this replaces rendered all 230 of the trip's
 * days at once - every one of them a card with its own drag context and its
 * own weather lookup - so the screen cost a fortune to mount and showed a wall
 * of empty days. Fourteen rows fit on two screens, and only an open leg pays
 * for its days.
 *
 * WHY A DAY WITH NOTHING ON IT IS NOT A CARD. 228 of the trip's days are
 * empty. Giving each the same card as a full day made the two indistinguishable
 * while scrolling; a one-line row keeps an empty day tappable without letting
 * it compete with a day that actually holds something.
 */
export function LegSection({
  leg,
  open,
  onToggle,
  onOpenIdeas,
  onAddToDay,
  renderDay,
  isDayEmpty,
  registerDayRef,
  todayISO: today,
}: {
  leg: LegOverview;
  open: boolean;
  onToggle: () => void;
  /** Opens the options bank filtered to this leg. */
  onOpenIdeas: () => void;
  onAddToDay: (day: ItineraryDay) => void;
  /** A full day card. Called only for days that have something on them, and
   *  only while the leg is open, which is what keeps the mount cost down. */
  renderDay: (day: ItineraryDay) => React.ReactNode;
  isDayEmpty: (day: ItineraryDay) => boolean;
  /** Lets the screen scroll to one date - the calendar jumps that way, and an
   *  empty day is a target too, so every row registers and not just the cards. */
  registerDayRef?: (dayId: string, el: HTMLDivElement | null) => void;
  todayISO: string;
}) {
  const { stretch, phase } = leg;
  const v2 = isEnabled("itineraryV2");
  const label =
    stretch.locationName ??
    (stretch.countryCode ? countryName(stretch.countryCode) : strings.bookings.legUnknown);

  const plannedLabel =
    leg.daysPlanned === 0
      ? strings.itinerary.legPlannedNone
      : leg.daysPlanned === leg.dayCount
        ? strings.itinerary.legPlannedAll
        : strings.itinerary.legPlanned
            .replace("{done}", String(leg.daysPlanned))
            .replace("{total}", String(leg.dayCount));

  return (
    <section
      className={`rounded-[18px] border border-s-4 bg-surface ${COUNTRY_EDGE[stretch.countryCode ?? ""] ?? "border-s-line"} ${
        phase === "current" ? "border-sea" : "border-line"
      } ${phase === "past" ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? strings.itinerary.legCollapse : strings.itinerary.legExpand}
        className={`w-full rounded-t-[18px] px-3 py-2.5 text-start active:bg-paper ${
          open && v2 ? "sticky top-0 z-10 bg-surface shadow-sm" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {stretch.countryCode && (
              <span className="flex items-center gap-1 rounded bg-sea-tint px-1.5 py-px text-[12px] font-bold text-sea-deep">
                {v2 && <span aria-hidden="true">{flagEmoji(stretch.countryCode)}</span>}
                {stretch.countryCode}
              </span>
            )}
            <span className="truncate text-[14.5px] font-extrabold text-ink">
              {label}
            </span>
            {phase === "current" && (
              <span className="rounded-full bg-sea px-2 py-0.5 text-[12px] font-bold text-on-sea">
                {strings.itinerary.legHere}
              </span>
            )}
            {phase === "past" && (
              <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[12px] font-bold text-ink-soft">
                {strings.itinerary.legDone}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-ink-soft">
            <span className="text-[12px] font-semibold" dir="ltr">
              {formatShortDate(stretch.from)}
              {stretch.to !== stretch.from && ` - ${formatShortDate(stretch.to)}`}
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        </div>

        {/* How much of the leg is actually planned, as a bar and as words. The
            bar alone would be decoration; the words alone make fourteen legs
            impossible to compare at a glance. */}
        <div className="mt-2 flex items-center gap-2">
          <span
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep"
            role="img"
            aria-label={plannedLabel}
          >
            <span
              className="block h-full rounded-full bg-sea"
              style={{
                width: `${Math.round((leg.daysPlanned / leg.dayCount) * 100)}%`,
              }}
            />
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-ink-soft">
            {leg.dayCount === 1
              ? strings.itinerary.legDaysOne
              : strings.itinerary.legDays.replace("{n}", String(leg.dayCount))}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
              leg.daysPlanned === 0
                ? "bg-paper-deep text-ink-soft"
                : "bg-sea-tint text-sea-deep"
            }`}
          >
            {plannedLabel}
          </span>
          {leg.bookings > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-paper-deep px-1.5 py-0.5 text-[12px] font-semibold text-ink">
              <CalendarIcon className="h-3 w-3" />
              {leg.bookings === 1
                ? strings.itinerary.legBookingsOne
                : strings.itinerary.legBookings.replace("{n}", String(leg.bookings))}
            </span>
          )}
          {/* Only said when it is missing. A leg that has somewhere to sleep
              does not need a chip to say so; one that does not is the single
              most useful thing this row can tell you. */}
          {!leg.hasStay && (
            <span className="flex items-center gap-1 rounded-md bg-sun-tint px-1.5 py-0.5 text-[12px] font-semibold text-sun-deep">
              <BedIcon className="h-3 w-3" />
              {strings.itinerary.legNoStay}
            </span>
          )}
        </div>
      </button>

      {/* Outside the header button: a button cannot nest inside a button, and
          this one goes somewhere else entirely. */}
      {leg.ideas > 0 && (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            onClick={onOpenIdeas}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-sea/40 bg-sea-tint/40 py-1.5 text-[12px] font-bold text-sea-deep active:bg-sea-tint"
          >
            <SparkleIcon className="h-3.5 w-3.5" />
            {leg.ideaScope === "area"
              ? strings.itinerary.legIdeas.replace("{n}", String(leg.ideas))
              : strings.itinerary.legIdeasCountry
                  .replace("{n}", String(leg.ideas))
                  .replace(
                    "{country}",
                    leg.stretch.countryCode
                      ? countryName(leg.stretch.countryCode)
                      : ""
                  )}
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t border-line bg-paper/50 p-2.5">
          {(v2
            ? groupEmptyRuns(stretch.days, isDayEmpty, today)
            : stretch.days.map((day) => ({ kind: "day" as const, day }))
          ).map((block) =>
            block.kind === "empty-run" ? (
              <EmptyRun
                key={`run-${block.from}`}
                days={block.days}
                from={block.from}
                to={block.to}
                onPlan={onOpenIdeas}
                onAdd={onAddToDay}
                registerDayRef={registerDayRef}
              />
            ) : (
              <div
                key={block.day.id}
                ref={(el) => registerDayRef?.(block.day.id, el)}
                className="scroll-mt-16"
              >
                {isDayEmpty(block.day) ? (
                  <EmptyDayRow
                    day={block.day}
                    isToday={block.day.date === today}
                    onAdd={() => onAddToDay(block.day)}
                  />
                ) : (
                  renderDay(block.day)
                )}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

/** A day with nothing on it: date, weekday, and the one thing you would want
 *  to do to it. */
function EmptyDayRow({
  day,
  isToday,
  onAdd,
}: {
  day: ItineraryDay;
  isToday: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={strings.itinerary.emptyDayAdd}
      className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-start active:bg-paper-deep ${
        isToday ? "bg-sea-tint" : "bg-surface/70"
      }`}
    >
      {/* DD/MM, not the day number alone: a leg runs 38 days here and crosses
          the turn of a month, where a bare "04" under a "30" says nothing. */}
      <span
        className={`w-10 shrink-0 text-[12.5px] font-bold tabular-nums ${
          isToday ? "text-sea-deep" : "text-ink"
        }`}
        dir="ltr"
      >
        {formatShortDate(day.date)}
      </span>
      <span className="w-5 shrink-0 text-[12px] text-ink-soft">
        {formatWeekdayNarrow(day.date)}
      </span>
      <span className="h-px flex-1 border-t border-dashed border-line" />
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
    </button>
  );
}

// Literal classes so Tailwind keeps them: the leg's country as a side stripe.
const COUNTRY_EDGE: Record<string, string> = {
  VN: "border-s-vn",
  KH: "border-s-kh",
  LA: "border-s-la",
  TH: "border-s-th",
  PH: "border-s-ph",
  JP: "border-s-jp",
  GE: "border-s-ge",
};

/** F4: a run of 2+ empty days as one row, with "plan from the bank". */
function EmptyRun({
  days,
  from,
  to,
  onPlan,
  onAdd,
  registerDayRef,
}: {
  days: ItineraryDay[];
  from: string;
  to: string;
  onPlan: () => void;
  onAdd: (day: ItineraryDay) => void;
  registerDayRef?: (dayId: string, el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      ref={(el) => {
        // Every hidden day points at the group, so a calendar jump still lands.
        for (const d of days) registerDayRef?.(d.id, el);
      }}
      className="scroll-mt-16 rounded-xl border-[1.5px] border-dashed border-line bg-surface/70 p-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-ink">
            {strings.itinerary.emptyRun.replace("{n}", String(days.length))}
          </span>
          <span className="text-[12px] text-ink-soft" dir="ltr">
            {formatShortDate(from)} - {formatShortDate(to)}
          </span>
        </span>
        <button
          type="button"
          onClick={onPlan}
          className="flex items-center gap-1 rounded-lg bg-sea-tint px-3 text-[13px] font-bold text-sea-deep"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
          {strings.itinerary.planFromBank}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? strings.itinerary.emptyRunHide : strings.itinerary.emptyRunShow}
          className="flex items-center justify-center rounded-lg text-ink-soft"
        >
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {days.map((day) => (
            <EmptyDayRow key={day.id} day={day} isToday={false} onAdd={() => onAdd(day)} />
          ))}
        </div>
      )}
    </div>
  );
}
