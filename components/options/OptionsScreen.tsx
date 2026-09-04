"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtractSheet } from "@/components/options/ExtractSheet";
import { OptionsMap } from "@/components/options/OptionsMap";
import { OptionFormSheet } from "@/components/options/OptionFormSheet";
import { PromoteSheet } from "@/components/options/PromoteSheet";
import { Toast } from "@/components/Toast";
import {
  createPlaceOption,
  createPlaceOptions,
  deletePlaceOption,
  filterOptions,
  tallyByArea,
  geocodePlaceOptions,
  resetGeocodeAttempts,
  listPlaceOptions,
  promoteToBooking,
  mapsSearchUrl,
  setPlaceOptionStatus,
  updatePlaceOption,
  PLACE_CATEGORIES,
  type PlaceOptionInput,
} from "@/lib/data/placeOptions";
import { listDays } from "@/lib/data/itinerary";
import { getActiveTrip } from "@/lib/data/trip";
import { strings } from "@/lib/strings";
import type { ComponentType } from "react";
import {
  AttractionIcon,
  BackpackIcon,
  BagIcon,
  BedIcon,
  BusIcon,
  CityIcon,
  type IconProps,
  LeafIcon,
  PinIcon,
  RestaurantIcon,
} from "@/components/icons";
import {
  CheckIcon,
  ClipboardIcon,
  GlobeIcon,
  StarIcon,
} from "@/components/icons";
import { useMember } from "@/lib/useMember";
import type { PlaceOption, PlaceOptionStatus, Trip } from "@/lib/types";

const CATEGORY_ICON: Record<string, ComponentType<IconProps>> = {
  hotel: BedIcon,
  restaurant: RestaurantIcon,
  attraction: AttractionIcon,
  activity: BackpackIcon,
  city: CityIcon,
  nature: LeafIcon,
  transport: BusIcon,
  shop: BagIcon,
  other: PinIcon,
};

/** Category glyph by key, falling back to the neutral pin. */
function CategoryIcon({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category ?? "other"] ?? PinIcon;
  return <Icon className={className} />;
}

const STATUS_CLASS: Record<PlaceOptionStatus, string> = {
  option: "bg-paper-deep text-ink-soft",
  shortlist: "bg-sun/20 text-ink",
  planned: "bg-sea-tint text-sea-deep",
  booked: "bg-sea/15 text-sea",
  rejected: "bg-paper-deep text-ink-soft line-through",
};

type Grouped = {
  country: string;
  areas: { area: string; options: PlaceOption[] }[];
}[];

function group(options: PlaceOption[], ungrouped: string): Grouped {
  const byCountry = new Map<string, Map<string, PlaceOption[]>>();
  for (const o of options) {
    const c = o.country?.trim() || ungrouped;
    const a = o.area?.trim() || "";
    if (!byCountry.has(c)) byCountry.set(c, new Map());
    const areas = byCountry.get(c)!;
    if (!areas.has(a)) areas.set(a, []);
    areas.get(a)!.push(o);
  }
  return [...byCountry.entries()].map(([country, areas]) => ({
    country,
    areas: [...areas.entries()].map(([area, opts]) => ({ area, options: opts })),
  }));
}

export function OptionsScreen() {
  const s = strings.options;
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlaceOption | "new" | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [promoting, setPromoting] = useState<PlaceOption | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlaceOptionStatus | null>(null);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [locating, setLocating] = useState<string | null>(null);
  // Itinerary days, purely to answer "how many days are we even there?" next
  // to each area. Loaded once; a failure just leaves the tally showing zero
  // days rather than blocking the bank.
  const [days, setDays] = useState<{ location_name: string | null }[]>([]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setOptions(await listPlaceOptions(tripId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await getActiveTrip();
      if (cancelled || !t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      await refresh(t.id);
      // Best-effort: the tally is a nicety, so a failure here must not stop
      // the bank from rendering.
      void listDays(t.id)
        .then((d) => {
          if (!cancelled) setDays(d);
        })
        .catch(() => {});
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const tally = useMemo(() => tallyByArea(options, days), [options, days]);

  const countries = useMemo(
    () =>
      [...new Set(options.map((o) => o.country?.trim()).filter(Boolean))] as string[],
    [options]
  );
  const areas = useMemo(
    () => [...new Set(options.map((o) => o.area?.trim()).filter(Boolean))] as string[],
    [options]
  );

  // Areas offered narrow to the chosen country, so the two cuts compose
  // instead of producing empty results.
  const areasForCountry = useMemo(() => {
    const pool = countryFilter
      ? options.filter(
          (o) =>
            (o.country ?? "").trim().toLowerCase() ===
            countryFilter.trim().toLowerCase()
        )
      : options;
    return [...new Set(pool.map((o) => o.area?.trim()).filter(Boolean))] as string[];
  }, [countryFilter, options]);

  const save = useCallback(
    async (input: PlaceOptionInput) => {
      if (!trip) return;
      if (input.title.trim() === "") {
        showToast(s.invalid);
        return;
      }
      try {
        if (editing && editing !== "new") {
          await updatePlaceOption(editing.id, input);
        } else {
          await createPlaceOption(trip.id, input, member?.id ?? null);
        }
        setEditing(null);
        await refresh(trip.id);
      } catch {
        showToast(strings.common.error);
      }
    },
    [editing, member, refresh, s.invalid, showToast, trip]
  );

  const saveExtracted = useCallback(
    async (inputs: PlaceOptionInput[]) => {
      if (!trip) return;
      try {
        await createPlaceOptions(trip.id, inputs, member?.id ?? null);
        setExtracting(false);
        await refresh(trip.id);
      } catch {
        showToast(strings.common.error);
      }
    },
    [member, refresh, showToast, trip]
  );

  const changeStatus = useCallback(
    async (option: PlaceOption, status: PlaceOptionStatus) => {
      if (!trip) return;
      try {
        await setPlaceOptionStatus(option.id, status);
        await refresh(trip.id);
      } catch {
        showToast(strings.common.error);
      }
    },
    [refresh, showToast, trip]
  );

  const promote = useCallback(
    async (fields: {
      startDate: string | null;
      endDate: string | null;
      notes: string | null;
    }) => {
      if (!trip || !promoting) return;
      try {
        await promoteToBooking(promoting, fields);
        setPromoting(null);
        await refresh(trip.id);
        showToast(s.promoteDone);
      } catch {
        showToast(s.promoteFailed);
      }
    },
    [promoting, refresh, s.promoteDone, s.promoteFailed, showToast, trip]
  );

  /** Resolves names to coordinates a batch at a time, reporting progress. The
   *  keyless provider is throttled to about a request a second, so a big bank
   *  takes a while — showing the remaining count beats a frozen button. */
  const locate = useCallback(async () => {
    if (!trip || locating !== null) return;
    setLocating(s.mapLocating);
    try {
      // A tap means "try these again". Without this the run would skip every
      // row that already used up its attempts and report success while the
      // banner still said N places have no pin — a button that does nothing.
      await resetGeocodeAttempts(trip.id);
      for (let pass = 0; pass < 20; pass++) {
        const { remaining } = await geocodePlaceOptions(trip.id);
        await refresh(trip.id);
        if (remaining === 0) break;
        setLocating(s.mapLocatingCount.replace("{n}", String(remaining)));
      }
      showToast(s.mapLocated);
    } catch {
      showToast(strings.common.error);
    } finally {
      setLocating(null);
    }
  }, [locating, refresh, s, showToast, trip]);

  const remove = useCallback(
    async (id: string) => {
      if (!trip || !confirm(s.deleteConfirm)) return;
      try {
        await deletePlaceOption(id);
        setOptions((prev) => prev.filter((o) => o.id !== id));
      } catch {
        showToast(strings.common.error);
      }
    },
    [s.deleteConfirm, showToast, trip]
  );

  if (memberLoading || loading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {s.ownersOnly}
      </div>
    );
  }

  // One filter, both views — a pin the list doesn't show would be a lie.
  const visible = filterOptions(options, {
    category: categoryFilter,
    status: statusFilter,
    country: countryFilter,
    area: areaFilter,
  });
  const grouped = group(visible, s.ungrouped);
  const unlocated = visible.filter((o) => o.lat == null || o.lng == null).length;
  // Named but unresolvable is a real outcome, not a pending one: say so rather
  // than implying one more tap will find them.
  const gaveUp = visible.filter(
    (o) => o.lat == null && o.geocode_attempts >= 3
  ).length;
  const activeCuts =
    (categoryFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (countryFilter ? 1 : 0) +
    (areaFilter ? 1 : 0);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pt-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{s.subtitle}</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-2xl bg-sea py-3 font-semibold text-white shadow-sm"
        >
          + {s.add}
        </button>
        <button
          type="button"
          onClick={() => setExtracting(true)}
          className="rounded-2xl border border-sea bg-white py-3 font-semibold text-sea shadow-sm"
        >
          <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" /> {s.importTitle}
        </button>
      </div>

      {options.length > 0 && (
        <div className="flex rounded-2xl border border-line bg-white p-1">
          {(["list", "map"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
                view === mode ? "bg-sea text-white" : "text-ink-soft"
              }`}
            >
              {mode === "list" ? s.viewList : s.viewMap}
            </button>
          ))}
        </div>
      )}

      {options.length > 0 && (countries.length > 1 || areas.length > 1) && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={countryFilter ?? ""}
            onChange={(e) => {
              setCountryFilter(e.target.value || null);
              // An area belongs to a country; keeping a stale one would
              // silently select nothing.
              setAreaFilter(null);
            }}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">{s.allCountries}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={areaFilter ?? ""}
            onChange={(e) => setAreaFilter(e.target.value || null)}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">{s.allAreas}</option>
            {areasForCountry.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {options.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {(["shortlist", "option", "booked", "rejected"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(statusFilter === st ? null : st)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                statusFilter === st ? "bg-ink text-white" : "bg-paper-deep text-ink-soft"
              }`}
            >
              {s.status[st]}
            </button>
          ))}
        </div>
      )}

      {options.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              categoryFilter === null ? "bg-ink text-white" : "bg-paper-deep text-ink-soft"
            }`}
          >
            {s.filterAll}
          </button>
          {PLACE_CATEGORIES.filter((c) => options.some((o) => o.category === c)).map(
            (c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  categoryFilter === c ? "bg-ink text-white" : "bg-paper-deep text-ink-soft"
                }`}
              >
                <CategoryIcon
                  category={c}
                  className="inline-block h-3.5 w-3.5 align-text-bottom"
                />{" "}
                {s.categories[c]}
              </button>
            )
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center">
          <p className="text-sm font-medium text-ink">
            {activeCuts > 0 ? s.noneForCut : s.empty}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {activeCuts > 0 ? s.noneForCutBody : s.emptyBody}
          </p>
        </div>
      ) : view === "map" ? (
        <OptionsMap
          options={visible}
          unlocatedCount={unlocated}
          gaveUpCount={gaveUp}
          onLocate={() => void locate()}
          locating={locating}
        />
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <section key={g.country}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-sea">
                    <GlobeIcon className="h-4 w-4" />
                    {g.country}
                  </h2>
              <div className="space-y-3">
                {g.areas.map((a) => (
                  <div key={a.area || "_"}>
                    {a.area && (
                      <h3 className="mb-1 flex flex-wrap items-baseline gap-x-1.5 pr-1 text-xs font-semibold text-ink-soft">
                        {a.area}
                        {(() => {
                          const t = tally.get(a.area.trim().toLowerCase());
                          if (!t) return null;
                          return (
                            <span className="font-normal text-ink-faint">
                              {t.days === 0
                                ? s.areaNoDays
                                : s.areaTally
                                    .replace("{days}", String(t.days))
                                    .replace("{options}", String(t.options))
                                    .replace("{planned}", String(t.planned))}
                            </span>
                          );
                        })()}
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {a.options.map((o) => {
                        const status = o.status as PlaceOptionStatus;
                        return (
                          <li
                            key={o.id}
                            className="rounded-2xl border border-line bg-white p-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-ink">
                                  <CategoryIcon
                                    category={o.category}
                                    className="inline-block h-4 w-4 align-text-bottom"
                                  />{" "}
                                  {o.title}
                                </p>
                                {o.note && (
                                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                                    {o.note}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}
                                  >
                                    {s.status[status]}
                                  </span>
                                  {o.booking_url && (
                                    <a
                                      href={o.booking_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-medium text-sea underline"
                                    >
                                      {s.book}
                                    </a>
                                  )}
                                  {(o.maps_url ??
                                    mapsSearchUrl(o.title, o.area, o.country)) && (
                                    <a
                                      href={
                                        o.maps_url ??
                                        mapsSearchUrl(o.title, o.area, o.country)!
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-medium text-sea underline"
                                    >
                                      {s.onMap}
                                    </a>
                                  )}
                                  {o.source_url && (
                                    <a
                                      href={o.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-ink-soft underline"
                                    >
                                      {s.open}
                                    </a>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setEditing(o)}
                                  className="text-ink-soft"
                                >
                                  {strings.common.edit}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void remove(o.id)}
                                  className="text-rose-600"
                                >
                                  {strings.common.delete}
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-2 text-xs">
                              {status !== "shortlist" && status !== "booked" && (
                                <button
                                  type="button"
                                  onClick={() => void changeStatus(o, "shortlist")}
                                  className="rounded-full bg-sun/20 px-3 py-1 font-medium"
                                >
                                  <StarIcon className="inline-block h-4 w-4 align-text-bottom" /> {s.markShortlist}
                                </button>
                              )}
                              {status === "booked" ? (
                                <span className="rounded-full bg-sea/15 px-3 py-1 font-medium text-sea">
                                  <CheckIcon className="inline-block h-4 w-4 align-text-bottom" /> {s.alreadyBooked}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPromoting(o)}
                                  className="rounded-full bg-sea px-3 py-1 font-medium text-white"
                                >
                                  {s.promoteTitle}
                                </button>
                              )}
                              {status !== "rejected" && status !== "booked" && (
                                <button
                                  type="button"
                                  onClick={() => void changeStatus(o, "rejected")}
                                  className="rounded-full bg-paper-deep px-3 py-1 font-medium text-ink-soft"
                                >
                                  {s.markRejected}
                                </button>
                              )}
                              {(status === "rejected" || status === "shortlist") && (
                                <button
                                  type="button"
                                  onClick={() => void changeStatus(o, "option")}
                                  className="rounded-full bg-paper-deep px-3 py-1 font-medium text-ink-soft"
                                >
                                  {s.markOption}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <OptionFormSheet
          // Remount per target so the form seeds from the right row.
          key={editing === "new" ? "new" : editing.id}
          open
          editing={editing === "new" ? null : editing}
          countries={countries}
          areas={areas}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      <ExtractSheet
        open={extracting}
        countries={countries}
        areas={areas}
        onClose={() => setExtracting(false)}
        onSave={saveExtracted}
      />

      <PromoteSheet
        key={promoting?.id ?? "none"}
        option={promoting}
        onClose={() => setPromoting(null)}
        onConfirm={promote}
      />

      <Toast message={toast} />
    </div>
  );
}
