"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getActiveTrip } from "@/lib/data/trip";
import { listDays, listItems } from "@/lib/data/itinerary";
import { listParents, listSteps, type Parent } from "@/lib/data/steps";
import { findCountry, flagEmoji } from "@/lib/countries";
import { countryHex } from "@/lib/mapV2";
import { isEnabled } from "@/lib/flags";
import { queryKeys, readQuery } from "@/lib/offline/queryCache";
import { passportStamps, stampTilt, tripStats } from "@/lib/tripStats";
import { totalBetween, type StepRow } from "@/lib/stepsView";
import { formatShortDate, todayISO } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { ScreenSkeleton } from "@/components/ui/Skeleton";
import { strings } from "@/lib/strings";
import type { ItineraryDay, ItineraryItem, Trip } from "@/lib/types";

const t = strings.stats;
const noop = () => () => {};
const fmt = (n: number) => n.toLocaleString("he-IL");

/**
 * Stats & stamps (2.6): the trip in numbers (countries, days, km on the plan,
 * nights per country, parents' steps when that is on) and a passport page with
 * one stamp per country - earned on arrival - for the kids. Reads what each
 * role may already read: itinerary days/items (kids too); steps only for owners.
 */
export function StatsScreen() {
  const on = useSyncExternalStore(noop, () => isEnabled("statsStamps"), () => false);
  const steps = useSyncExternalStore(noop, () => isEnabled("stepsCounter"), () => false);
  const { member } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[] | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [stepData, setStepData] = useState<{ parents: Parent[]; rows: StepRow[] } | null>(null);
  const owner = member?.role === "owner";

  useEffect(() => {
    let alive = true;
    void (async () => {
      const tr = await getActiveTrip();
      if (!alive || !tr) return setDays([]);
      setTrip(tr);
      const hit = await readQuery<{ days: ItineraryDay[]; items: ItineraryItem[] }>(queryKeys.itinerary(tr.id));
      if (alive && hit) {
        setDays(hit.data.days);
        setItems(hit.data.items ?? []);
      }
      try {
        const d = await listDays(tr.id);
        const it = await listItems(d.map((x) => x.id));
        if (!alive) return;
        setDays(d);
        setItems(it);
      } catch {
        if (alive && !hit) setDays([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!trip || !owner || !steps || !trip.start_date) return;
    let alive = true;
    void listParents(trip.id)
      .then(async (parents) => {
        const rows = await listSteps(parents.map((p) => p.id), trip.start_date!, todayISO());
        if (alive) setStepData({ parents, rows });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [trip, owner, steps]);

  if (!on) return null;
  if (days === null) return <ScreenSkeleton variant="cards" />;

  const today = todayISO();
  const s = tripStats(days, items, today);
  const stamps = passportStamps(days, today);
  const name = (code: string) => findCountry(code)?.he ?? code;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8 sm:max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-ink">{t.title}</h1>
      {days.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">{t.empty}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: t.countries, value: s.countriesVisited, total: s.countriesTotal },
              { label: t.days, value: s.daysDone, total: s.daysTotal },
              { label: t.km, value: s.kmSoFar, total: s.kmPlanned },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-line bg-surface px-3 py-2.5">
                <p className="text-[12px] font-bold text-ink-soft">{k.label}</p>
                <p className="mt-0.5 text-[22px] font-extrabold leading-7 tabular-nums text-ink">{fmt(k.value)}</p>
                <p className="text-[12px] text-ink-soft">{t.ofTotal.replace("{n}", fmt(k.total))}</p>
              </div>
            ))}
          </div>
          <p className="-mt-2 text-[12px] text-ink-soft">{t.kmHint}</p>

          {s.nightsByCountry.length > 0 && (
            <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
              <h2 className="text-xs font-bold text-ink">{t.nightsTitle}</h2>
              <ul className="mt-2 space-y-1.5">
                {s.nightsByCountry.map((c) => (
                  <li key={c.code} className="flex items-center gap-2">
                    <span aria-hidden="true">{flagEmoji(c.code)}</span>
                    <span className="w-20 shrink-0 truncate text-sm font-semibold text-ink">{name(c.code)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                      <span className="block h-full rounded-full" style={{ width: `${(c.nights / Math.max(1, s.daysDone)) * 100}%`, background: countryHex(c.code) }} />
                    </span>
                    <span className="w-16 shrink-0 text-end text-[12px] tabular-nums text-ink-soft">{t.nights.replace("{n}", String(c.nights))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stepData && trip?.start_date && (
            <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
              <h2 className="text-xs font-bold text-ink">{t.stepsTitle}</h2>
              <ul className="mt-1.5 grid grid-cols-2 gap-2">
                {stepData.parents.map((p) => (
                  <li key={p.id}>
                    <p className="text-[12px] text-ink-soft">{p.name}</p>
                    <p className="text-lg font-extrabold tabular-nums text-ink">{fmt(totalBetween(stepData.rows, p.id, trip.start_date!, today))}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-bold text-ink">{t.passport}</h2>
            <ul className="grid grid-cols-3 gap-3 rounded-[18px] border border-line bg-paper-deep p-3">
              {stamps.map((st) => {
                const hex = countryHex(st.code);
                return (
                  <li key={st.code} className="flex justify-center">
                    <figure
                      aria-label={t.stampAria.replace("{country}", name(st.code)).replace("{state}", st.earned ? t.earned : t.notYet)}
                      className={`flex aspect-square w-full max-w-[104px] flex-col items-center justify-center rounded-full border-[3px] text-center ${st.earned ? "" : "border-dashed opacity-45 grayscale"}`}
                      style={{ borderColor: hex, color: hex, transform: `rotate(${stampTilt(st.code)}deg)`, boxShadow: st.earned ? `inset 0 0 0 3px var(--surface), inset 0 0 0 5px ${hex}` : undefined }}
                    >
                      <span aria-hidden="true" className="text-2xl leading-7">{flagEmoji(st.code)}</span>
                      <span className="text-[12px] font-extrabold uppercase leading-4">{name(st.code)}</span>
                      <bdi className="text-[12px] font-bold leading-4">{st.earned ? formatShortDate(st.firstDate) : t.stampSoon}</bdi>
                    </figure>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
