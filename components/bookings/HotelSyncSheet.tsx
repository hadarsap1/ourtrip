"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { countryName } from "@/lib/data/emergency";
import { setDaysPlace } from "@/lib/data/itinerary";
import { formatShortDate } from "@/lib/format";
import type { HotelSyncProposal } from "@/lib/hotelItinerarySync";
import { strings } from "@/lib/strings";
import type { ItineraryDay } from "@/lib/types";

/**
 * Asks before a hotel relabels the plan.
 *
 * Never silent: relabelling days moves their weather, emergency page and
 * phrasebook to another country, so the family sees what changes and can say
 * no. The town name is editable because the geocoder's idea of a town is not
 * always the family's - a Tokyo address can come back as its ward.
 */
export function HotelSyncSheet({
  proposals,
  onClose,
  onDone,
  onError,
}: {
  /** Null when closed. */
  proposals: HotelSyncProposal[] | null;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  if (!proposals || proposals.length === 0) return null;
  return (
    <HotelSyncForm
      // Remount per batch so the names and ticks start from the new proposals.
      key={proposals.map((p) => p.booking.id).join(",")}
      proposals={proposals}
      onClose={onClose}
      onDone={onDone}
      onError={onError}
    />
  );
}

/** What the days read as today, each label once, in date order. */
function currentLabels(days: ItineraryDay[]): string {
  const labels: string[] = [];
  for (const day of days) {
    const label =
      day.location_name ??
      (day.country_code ? countryName(day.country_code) : strings.bookings.legUnknown);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(", ");
}

function HotelSyncForm({
  proposals,
  onClose,
  onDone,
  onError,
}: {
  proposals: HotelSyncProposal[];
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  const s = strings.bookings;
  const [names, setNames] = useState(() => proposals.map((p) => p.place.locationName));
  const [chosen, setChosen] = useState(() => proposals.map(() => true));
  const [saving, setSaving] = useState(false);
  const single = proposals.length === 1;

  async function apply() {
    if (saving) return;
    setSaving(true);
    try {
      for (const [index, proposal] of proposals.entries()) {
        const name = names[index].trim();
        if (!chosen[index] || !name) continue;
        await setDaysPlace(
          proposal.days.map((day) => day.id),
          {
            location_name: name,
            country_code: proposal.place.countryCode,
            lat: proposal.place.lat,
            lng: proposal.place.lng,
          }
        );
      }
      onDone();
    } catch {
      onError();
      setSaving(false);
    }
  }

  const anyChosen = proposals.some((_, i) => chosen[i] && names[i].trim());

  return (
    <Sheet open onClose={onClose} title={single ? s.hotelSyncTitle : s.hotelSyncTitleMany}>
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">{s.hotelSyncBody}</p>

        {proposals.map((proposal, index) => {
          const first = proposal.days[0].date;
          const last = proposal.days[proposal.days.length - 1].date;
          const inputId = `hotel-sync-${proposal.booking.id}`;
          return (
            <div
              key={proposal.booking.id}
              className="space-y-2 rounded-xl border border-line bg-paper/70 p-3"
            >
              <label className="flex items-start gap-2">
                {!single && (
                  <input
                    type="checkbox"
                    checked={chosen[index]}
                    onChange={(e) =>
                      setChosen((prev) =>
                        prev.map((value, i) => (i === index ? e.target.checked : value))
                      )
                    }
                    className="mt-1 h-4 w-4 accent-sea"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-extrabold text-ink">
                    {proposal.booking.title}
                  </span>
                  <span className="block text-[11.5px] text-ink-soft">
                    <span dir="ltr">
                      {formatShortDate(first)}
                      {first !== last ? ` - ${formatShortDate(last)}` : ""}
                    </span>
                    {" · "}
                    {s.hotelSyncDays.replace("{n}", String(proposal.days.length))}
                    {proposal.place.countryCode && ` · ${countryName(proposal.place.countryCode)}`}
                  </span>
                  <span className="block text-[11.5px] text-ink-soft">
                    {s.hotelSyncFrom.replace("{labels}", currentLabels(proposal.days))}
                  </span>
                </span>
              </label>
              <div>
                <label
                  htmlFor={inputId}
                  className="mb-1 block text-[12.5px] font-semibold text-ink-soft"
                >
                  {s.hotelSyncName}
                </label>
                <input
                  id={inputId}
                  type="text"
                  value={names[index]}
                  onChange={(e) =>
                    setNames((prev) =>
                      prev.map((value, i) => (i === index ? e.target.value : value))
                    )
                  }
                  disabled={!chosen[index]}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink focus:border-sea focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>
          );
        })}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={saving || !anyChosen}
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-on-sea hover:bg-sea-deep disabled:opacity-60"
          >
            {s.hotelSyncApply}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-line px-4 py-3 font-semibold text-ink-soft hover:bg-paper-deep"
          >
            {s.expenseSkip}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
