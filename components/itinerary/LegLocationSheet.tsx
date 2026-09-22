"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { PlaceAutocomplete, type PlaceSelection } from "@/components/PlaceAutocomplete";
import { setDaysLocation } from "@/lib/data/itinerary";
import { loadGoogleMaps } from "@/lib/places";
import { countryName } from "@/lib/data/emergency";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { LegOverview } from "@/lib/itineraryOverview";

/**
 * Pins one leg to a town.
 *
 * The bank can place a leg whose label happens to name a town it knows, and
 * nothing else. This is the answer for the rest: the family says where the
 * leg is once, and it stops being derived - `legPoint` prefers a coordinate
 * on the days over anything it could work out, so the pin sticks.
 *
 * It writes to the days rather than to some new column because that is where
 * the coordinate is already read from, by the map screen and by the per-day
 * forecast. Pinning a 38-day leg gives 38 days their weather back.
 */
export function LegLocationSheet({
  leg,
  onClose,
  onSaved,
  onError,
}: {
  leg: LegOverview | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  if (!leg) return null;
  return (
    <LegLocationForm
      key={leg.key}
      leg={leg}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
    />
  );
}

function LegLocationForm({
  leg,
  onClose,
  onSaved,
  onError,
}: {
  leg: LegOverview;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  const s = strings.itinerary;
  // Seeded with the leg's own label, which is usually the town's name and so
  // usually the right search already.
  const [text, setText] = useState(leg.stretch.locationName ?? "");
  const [picked, setPicked] = useState<PlaceSelection | null>(null);
  const [saving, setSaving] = useState(false);
  // Without the Maps key PlaceAutocomplete is a plain text box that can never
  // return coordinates, so Save could never enable and nothing on screen said
  // why. Asking up front turns a dead end into a sentence.
  const [searchable, setSearchable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps().then((google) => {
      if (!cancelled) setSearchable(google !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!picked || picked.lat == null || picked.lng == null || saving) return;
    setSaving(true);
    try {
      await setDaysLocation(
        leg.stretch.days.map((day) => day.id),
        picked.lat,
        picked.lng
      );
      onSaved();
    } catch {
      onError();
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.mapSetTitle}>
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-paper/70 p-3">
          <p className="text-[13px] font-extrabold text-ink">
            {leg.stretch.locationName ??
              (leg.stretch.countryCode ? countryName(leg.stretch.countryCode) : "")}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-soft" dir="ltr">
            {formatShortDate(leg.stretch.from)} - {formatShortDate(leg.stretch.to)}
            {" · "}
            {s.legDays.replace("{n}", String(leg.dayCount))}
          </p>
        </div>

        <div>
          <label
            htmlFor="leg-place"
            className="mb-1 block text-[12.5px] font-semibold text-ink-soft"
          >
            {s.mapSetSearch}
          </label>
          <PlaceAutocomplete
            id="leg-place"
            value={text}
            onChange={(next) => {
              setText(next);
              // Typing after a pick invalidates it: the box would otherwise
              // say one town and save another.
              setPicked(null);
            }}
            onSelect={(place) => {
              setText(place.name);
              setPicked(place.lat != null && place.lng != null ? place : null);
            }}
          />
          <p
            className={`mt-1 text-[11.5px] ${
              searchable ? "text-ink-soft" : "font-semibold text-alert"
            }`}
            role={searchable ? undefined : "alert"}
          >
            {searchable ? s.mapSetHint : s.mapSearchUnavailable}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-line px-5 py-3 font-semibold text-ink-soft active:bg-paper-deep disabled:opacity-60"
          >
            {strings.common.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            // Only a pick with coordinates can be saved. Free text is allowed
            // in the box (the autocomplete degrades to a plain input without
            // an API key) but it cannot place anything on a map.
            disabled={saving || picked === null}
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white active:bg-sea-deep disabled:opacity-60"
          >
            {strings.common.save}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
