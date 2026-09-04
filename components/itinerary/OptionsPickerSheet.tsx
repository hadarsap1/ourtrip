"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { PinIcon, SearchIcon } from "@/components/icons";
import {
  listOptionsForCountry,
  rankForDay,
  type DayOption,
} from "@/lib/data/placeOptions";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay, PlaceOption } from "@/lib/types";

// The options bank, pointed at one day.
//
// The bank held 343 candidates and had never given one up, because the only
// way out was to create a booking. This sheet is the other exit: the day asks
// the bank what it has nearby, and one tap turns a candidate into an item.
// Ordering is what makes it usable — "ויטנאם" is 249 options and 53 days, so a
// flat list would be no better than the screen people already ignore.
export function OptionsPickerSheet({
  tripId,
  day,
  onClose,
  onPick,
}: {
  tripId: string;
  day: ItineraryDay;
  onClose: () => void;
  onPick: (option: PlaceOption) => void;
}) {
  const s = strings.options;
  const [options, setOptions] = useState<DayOption[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listOptionsForCountry(tripId, day.country_code)
      .then((rows) => {
        if (!cancelled) setOptions(rankForDay(rows, day));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, day]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!options) return null;
    if (q === "") return options;
    return options.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        (o.area ?? "").toLowerCase().includes(q) ||
        (o.note ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const dayArea = (day.location_name ?? "").trim().toLowerCase();

  return (
    <Sheet
      open
      onClose={onClose}
      title={s.pickForDay.replace("{date}", formatDate(day.date))}
    >
      {visible === null ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {strings.common.loading}
        </p>
      ) : options?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center">
          <p className="text-sm font-medium text-ink">{s.pickEmpty}</p>
          <p className="mt-1 text-xs text-ink-soft">{s.pickEmptyBody}</p>
        </div>
      ) : (
        <>
          <label className="mb-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={s.pickSearch}
              className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
            />
          </label>

          <ul className="divide-y divide-line">
            {visible.map((option) => {
              const inDayArea =
                dayArea !== "" &&
                (option.area ?? "").trim().toLowerCase() === dayArea;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => onPick(option)}
                    className="flex w-full items-start gap-3 py-3 text-start hover:bg-paper-deep"
                  >
                    <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-sea" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {option.title}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {option.area ? `${option.area} · ` : ""}
                        {inDayArea
                          ? s.pickHere
                          : option.distanceKm != null
                            ? s.pickNearby.replace(
                                "{n}",
                                String(Math.round(option.distanceKm))
                              )
                            : s.pickNoLocation}
                      </span>
                    </span>
                    {option.category && (
                      <span className="shrink-0 rounded-full bg-paper-deep px-2 py-0.5 text-[10.5px] text-ink-soft">
                        {s.categories[
                          option.category as keyof typeof s.categories
                        ] ?? option.category}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
