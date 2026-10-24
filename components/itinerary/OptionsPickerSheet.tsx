"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { CheckIcon, ChevronForwardIcon, PinIcon, SearchIcon } from "@/components/icons";
import {
  groupForDay,
  listOptionsForCountry,
  rankForDay,
  type DayOption,
  type DayOptionGroup,
} from "@/lib/data/placeOptions";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay, PlaceOption } from "@/lib/types";

// The options bank, pointed at one day.
//
// Two things this got wrong on the first pass, both visible only against the
// real trip. The list was ordered by distance from the day, and NO day on this
// trip has coordinates - so it was one unordered scroll of up to 229 rows. And
// it closed after a single pick, so putting four places on a day meant opening
// it four times. It now groups by area and takes as many as you tick.
export function OptionsPickerSheet({
  tripId,
  day,
  plannedCount,
  onClose,
  onPick,
}: {
  tripId: string;
  day: ItineraryDay;
  /** How many items the day already holds, so sort order continues. */
  plannedCount: number;
  onClose: () => void;
  onPick: (options: PlaceOption[]) => void;
}) {
  const s = strings.options;
  const [groups, setGroups] = useState<DayOptionGroup[] | null>(null);
  const [flat, setFlat] = useState<DayOption[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openArea, setOpenArea] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listOptionsForCountry(tripId, day.country_code)
      .then((rows) => {
        if (cancelled) return;
        const grouped = groupForDay(rows, day);
        setGroups(grouped);
        setFlat(rankForDay(rows, day));
        // Open the biggest group, so the sheet lands on something useful
        // instead of a list of collapsed headers.
        setOpenArea(grouped[0]?.area ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          setFlat([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, day]);

  const searching = query.trim() !== "";
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    return flat.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        (o.area ?? "").toLowerCase().includes(q) ||
        (o.note ?? "").toLowerCase().includes(q)
    );
  }, [flat, query]);

  const byId = useMemo(() => new Map(flat.map((o) => [o.id, o])), [flat]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const chosen = [...picked]
      .map((id) => byId.get(id))
      .filter((o): o is DayOption => o !== undefined);
    if (chosen.length > 0) onPick(chosen);
  }

  function Row({ option }: { option: DayOption }) {
    const on = picked.has(option.id);
    return (
      <li>
        <button
          type="button"
          onClick={() => toggle(option.id)}
          aria-pressed={on}
          className="flex w-full items-start gap-3 py-2.5 text-start hover:bg-paper-deep"
        >
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
              on ? "border-sea bg-sea text-on-sea" : "border-line bg-surface"
            }`}
            aria-hidden="true"
          >
            {on && <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-ink">
              {option.title}
            </span>
            <span className="block truncate text-[12px] text-ink-soft">
              {option.area ? `${option.area} · ` : ""}
              {s.categories[option.category as keyof typeof s.categories] ??
                option.category ??
                s.pickNoLocation}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={s.pickForDay.replace("{date}", formatDate(day.date))}
    >
      {plannedCount > 0 && (
        <p className="mb-2 rounded-xl bg-paper-deep px-3 py-2 text-[12px] text-ink-soft">
          {s.pickAlready.replace("{n}", String(plannedCount))}
        </p>
      )}

      {groups === null ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {strings.common.loading}
        </p>
      ) : flat.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
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

          {/* Searching flattens the groups: you already know what you want. */}
          {searching ? (
            matches.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">
                {s.noneForCut}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {matches.map((o) => (
                  <Row key={o.id} option={o} />
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-1">
              {groups.map((group) => {
                const key = group.area ?? "_";
                const open = openArea === group.area;
                const chosenHere = group.options.filter((o) =>
                  picked.has(o.id)
                ).length;
                return (
                  <section key={key}>
                    <button
                      type="button"
                      onClick={() => setOpenArea(open ? null : group.area)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 rounded-xl px-1 py-2.5 text-start hover:bg-paper-deep"
                    >
                      <ChevronForwardIcon
                        className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${
                          open ? "-rotate-90" : ""
                        }`}
                      />
                      <PinIcon className="h-4 w-4 shrink-0 text-sea" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
                        {group.area ?? s.ungrouped}
                      </span>
                      {chosenHere > 0 && (
                        <span className="shrink-0 rounded-full bg-sea px-2 py-0.5 text-[12px] font-bold text-on-sea">
                          {chosenHere}
                        </span>
                      )}
                      <span className="shrink-0 text-[12px] text-ink-faint">
                        {group.options.length}
                      </span>
                    </button>
                    {open && (
                      <ul className="divide-y divide-line ps-6">
                        {group.options.map((o) => (
                          <Row key={o.id} option={o} />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={picked.size === 0}
            className="sticky bottom-0 mt-3 w-full rounded-2xl bg-sea py-3 font-semibold text-on-sea shadow-sm disabled:opacity-40"
          >
            {picked.size === 0
              ? s.pickNoneChosen
              : s.pickAdd.replace("{n}", String(picked.size))}
          </button>
        </>
      )}
    </Sheet>
  );
}
