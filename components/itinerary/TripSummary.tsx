"use client";

import type { LegOverview } from "@/lib/itineraryOverview";
import { strings } from "@/lib/strings";

/**
 * The whole trip in one line, above the legs.
 *
 * Fourteen collapsed rows answer "what is the shape of this trip" but not
 * "how far along is the planning", and that second question was the one the
 * old list made impossible: 230 cards with two of them filled looks exactly
 * like 230 cards with none.
 */
export function TripSummary({
  legs,
  onJump,
}: {
  legs: LegOverview[];
  onJump: () => void;
}) {
  const days = legs.reduce((sum, leg) => sum + leg.dayCount, 0);
  const planned = legs.reduce((sum, leg) => sum + leg.daysPlanned, 0);
  const countries = new Set(
    legs.map((leg) => leg.stretch.countryCode).filter(Boolean)
  ).size;
  const current = legs.find((leg) => leg.phase === "current");

  return (
    <section className="rounded-[18px] border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold text-ink-soft">
          {strings.itinerary.tripSpan
            .replace("{days}", String(days))
            .replace("{legs}", String(legs.length))
            .replace("{countries}", String(countries))}
        </p>
        <button
          type="button"
          onClick={onJump}
          className="shrink-0 rounded-lg bg-sea-tint px-2.5 py-1 text-[11.5px] font-bold text-sea-deep active:bg-sea-tint/70"
        >
          {current ? strings.itinerary.jumpToday : strings.itinerary.jumpNext}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
          <span
            className="block h-full rounded-full bg-sea"
            style={{ width: `${days === 0 ? 0 : Math.round((planned / days) * 100)}%` }}
          />
        </span>
        <span className="shrink-0 text-[11.5px] font-bold text-ink">
          {strings.itinerary.tripPlanned.replace("{done}", String(planned))}
        </span>
      </div>
    </section>
  );
}
