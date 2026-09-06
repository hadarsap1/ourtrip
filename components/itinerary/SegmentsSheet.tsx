"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ChevronForwardIcon, CloseIcon, PinIcon, PlusIcon } from "@/components/icons";
import { listPlaceOptions } from "@/lib/data/placeOptions";
import {
  applyLegPlan,
  areaChoicesForCountry,
  moveLeg,
  planLegs,
  splitIntoStretches,
  totalLegDays,
  type AreaChoice,
  type Leg,
  type Stretch,
} from "@/lib/data/segments";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay, PlaceOption } from "@/lib/types";

// Turning a country-sized block of days into the towns the family is in.
//
// The route is entered the way people say it - an ordered list of stops with a
// number of days each - not as a date range per stop. A pair of date pickers
// per leg invites gaps and overlaps; a running "18 of 23 days" cannot.


export function SegmentsSheet({
  tripId,
  days,
  open,
  onClose,
  onApplied,
  onError,
}: {
  tripId: string;
  days: ItineraryDay[];
  open: boolean;
  onClose: () => void;
  onApplied: (updated: number) => void;
  onError: (message: string) => void;
}) {
  const s = strings.segments;
  const [bank, setBank] = useState<PlaceOption[]>([]);
  const [areas, setAreas] = useState<AreaChoice[] | null>(null);
  const [stretch, setStretch] = useState<Stretch | null>(null);
  const [chosen, setChosen] = useState<Leg[]>([]);
  const [busy, setBusy] = useState(false);

  const stretches = useMemo(() => splitIntoStretches(days), [days]);

  const dayLabel = (n: number) =>
    n === 1 ? s.dayOne : s.dayCount.replace("{n}", String(n));
  const optionLabel = (n: number) =>
    n === 1 ? s.optionOne : s.optionCount.replace("{n}", String(n));

  // The whole bank once, then narrowed per stretch: the sheet is opened to
  // plan several countries in a row, and re-fetching per country would make
  // every back-and-forth a round trip.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listPlaceOptions(tripId)
      .then((options) => {
        if (cancelled) return;
        setBank(options);
        setAreas(areaChoicesForCountry(options, null));
      })
      .catch(() => {
        if (!cancelled) {
          setBank([]);
          setAreas([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, tripId]);

  function openStretch(next: Stretch) {
    setStretch(next);
    setChosen([]);
    setAreas(areaChoicesForCountry(bank, next.countryCode));
  }

  function backToList() {
    setStretch(null);
    setChosen([]);
  }

  function addArea(choice: AreaChoice) {
    setChosen((prev) =>
      prev.some((l) => l.area === choice.area)
        ? prev
        : [...prev, { area: choice.area, days: 1, lat: choice.lat, lng: choice.lng }]
    );
  }

  function setDays(index: number, next: number) {
    setChosen((prev) =>
      next <= 0
        ? prev.filter((_, i) => i !== index)
        : prev.map((leg, i) => (i === index ? { ...leg, days: next } : leg))
    );
  }

  const plan = stretch ? planLegs(stretch, chosen) : null;
  const used = totalLegDays(chosen);
  const capacity = stretch?.days.length ?? 0;

  async function apply() {
    if (!stretch || !plan || plan.assignments.length === 0 || busy) return;
    setBusy(true);
    try {
      const updated = await applyLegPlan(plan);
      onApplied(updated);
      backToList();
    } catch {
      onError(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ list */

  if (!stretch) {
    return (
      <Sheet open={open} onClose={onClose} title={s.title}>
        <p className="mb-4 text-sm leading-relaxed text-ink-soft">{s.intro}</p>
        {stretches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
            {s.noDays}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {stretches.map((item) => (
              <li key={`${item.from}-${item.locationName ?? ""}`}>
                <button
                  type="button"
                  onClick={() => openStretch(item)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 py-3 text-start active:bg-paper-deep"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">
                      {item.locationName ?? s.unlabelled}
                    </span>
                    <span className="block text-xs text-ink-soft" dir="ltr">
                      {formatDate(item.from)} - {formatDate(item.to)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-paper-deep px-2.5 py-1 text-[11px] font-bold text-ink-soft">
                      {dayLabel(item.days.length)}
                    </span>
                    <ChevronForwardIcon className="h-3.5 w-3.5 text-ink-faint" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  /* ----------------------------------------------------------------- editor */

  const available = (areas ?? []).filter(
    (a) => !chosen.some((l) => l.area === a.area)
  );

  return (
    <Sheet open={open} onClose={onClose} title={stretch.locationName ?? s.unlabelled}>
      <button
        type="button"
        onClick={backToList}
        className="mb-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-sea"
      >
        <ChevronForwardIcon className="h-3.5 w-3.5 rotate-180" />
        {s.back}
      </button>

      {/* The one number that says whether the route is finished. */}
      <div className="mb-4 rounded-[14px] border border-line bg-paper-deep px-3.5 py-2.5">
        <p className="text-sm font-bold text-ink">
          {s.assigned
            .replace("{n}", String(Math.min(used, capacity)))
            .replace("{total}", String(capacity))}
        </p>
        {plan && plan.leftover.length > 0 && (
          <p className="mt-0.5 text-xs text-ink-soft">
            {s.leftover.replace("{n}", String(plan.leftover.length))}
          </p>
        )}
        {used > capacity && (
          <p className="mt-0.5 text-xs font-semibold text-rose-600">
            {s.overflow.replace("{n}", String(used - capacity))}
          </p>
        )}
      </div>

      {chosen.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
            {s.routeTitle}
          </h3>
          <ul className="space-y-2">
            {chosen.map((leg, index) => {
              const legDays = plan?.assignments.filter(
                (a) => a.locationName === leg.area
              );
              return (
                <li
                  key={leg.area}
                  className="rounded-[14px] border border-line bg-white p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sea text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {leg.area}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChosen((p) => moveLeg(p, index, -1))}
                      disabled={index === 0}
                      aria-label={s.moveUp}
                      className="grid h-11 w-11 place-items-center rounded-[11px] text-ink-soft disabled:opacity-30"
                    >
                      <ChevronForwardIcon className="h-3.5 w-3.5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setChosen((p) => moveLeg(p, index, 1))}
                      disabled={index === chosen.length - 1}
                      aria-label={s.moveDown}
                      className="grid h-11 w-11 place-items-center rounded-[11px] text-ink-soft disabled:opacity-30"
                    >
                      <ChevronForwardIcon className="h-3.5 w-3.5 -rotate-90" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-ink-soft" dir="ltr">
                      {legDays && legDays.length > 0
                        ? `${formatDate(legDays[0].day.date)} - ${formatDate(
                            legDays[legDays.length - 1].day.date
                          )}`
                        : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDays(index, leg.days - 1)}
                        aria-label={s.oneLess}
                        className="grid h-11 w-11 place-items-center rounded-[11px] bg-paper-deep text-lg font-bold text-ink-soft active:bg-line"
                      >
                        −
                      </button>
                      <span className="min-w-[3.5rem] text-center text-sm font-bold text-ink">
                        {dayLabel(leg.days)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDays(index, leg.days + 1)}
                        disabled={used >= capacity}
                        aria-label={s.oneMore}
                        className="grid h-11 w-11 place-items-center rounded-[11px] bg-sea text-white active:bg-sea-deep disabled:opacity-30"
                      >
                        <PlusIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
          {s.availableTitle}
        </h3>
        {areas === null ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            {strings.common.loading}
          </p>
        ) : available.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-ink-soft">
            {chosen.length > 0 ? s.allAreasUsed : s.noAreas}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {available.map((choice) => (
              <li key={choice.area}>
                <button
                  type="button"
                  onClick={() => addArea(choice)}
                  disabled={used >= capacity}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 py-2.5 text-start active:bg-paper-deep disabled:opacity-40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PinIcon className="h-4 w-4 shrink-0 text-sea" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {choice.area}
                      </span>
                      {choice.lat === null && (
                        <span className="block text-[11px] text-ink-faint">
                          {s.noCoords}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-sea-tint px-2.5 py-1 text-[11px] font-bold text-sea-deep">
                      {optionLabel(choice.options)}
                    </span>
                    <PlusIcon className="h-4 w-4 text-ink-faint" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || !plan || plan.assignments.length === 0}
          className="min-h-[48px] flex-1 rounded-xl bg-sea px-4 font-bold text-white active:bg-sea-deep disabled:opacity-40"
        >
          {busy ? strings.common.loading : s.apply}
        </button>
        <button
          type="button"
          onClick={() => setChosen([])}
          disabled={busy || chosen.length === 0}
          aria-label={s.clear}
          className="grid min-h-[48px] w-12 place-items-center rounded-xl border border-line bg-white text-ink-soft disabled:opacity-40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </Sheet>
  );
}
