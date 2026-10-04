"use client";

import type { LegOverview } from "@/lib/itineraryOverview";
import { strings } from "@/lib/strings";
import { isEnabled } from "@/lib/flags";
import { countryName } from "@/lib/data/emergency";
import { MetroLine } from "./MetroLine";

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
  onOpenLeg,
}: {
  legs: LegOverview[];
  onJump: () => void;
  /** Trip overview (2.5): open one stay from the metro line. */
  onOpenLeg?: (key: string) => void;
}) {
  const days = legs.reduce((sum, leg) => sum + leg.dayCount, 0);
  const planned = legs.reduce((sum, leg) => sum + leg.daysPlanned, 0);
  const countries = new Set(
    legs.map((leg) => leg.stretch.countryCode).filter(Boolean)
  ).size;
  const current = legs.find((leg) => leg.phase === "current");

  return (
    <section className="rounded-[18px] border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-ink-soft">
          {strings.itinerary.tripSpan
            .replace("{days}", String(days))
            .replace("{legs}", String(legs.length))
            .replace("{countries}", String(countries))}
        </p>
        <button
          type="button"
          onClick={onJump}
          className="shrink-0 rounded-lg bg-sea-tint px-2.5 py-1 text-[12px] font-bold text-sea-deep active:bg-sea-tint/70"
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
        <span className="shrink-0 text-[12px] font-bold text-ink">
          {strings.itinerary.tripPlanned.replace("{done}", String(planned))}
        </span>
      </div>
      {onOpenLeg && isEnabled("tripOverview") && (
        <div className="mt-3 border-t border-line pt-2">
          <MetroLine
            onOpen={onOpenLeg}
            legs={legs.map((leg) => ({
              key: leg.key,
              label: leg.stretch.locationName ?? (leg.stretch.countryCode ? countryName(leg.stretch.countryCode) : ""),
              countryCode: leg.stretch.countryCode,
              from: leg.stretch.from,
              to: leg.stretch.to,
              nights: leg.dayCount,
              phase: leg.phase,
            }))}
          />
        </div>
      )}
    </section>
  );
}
