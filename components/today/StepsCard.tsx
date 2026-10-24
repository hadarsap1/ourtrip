"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isEnabled } from "@/lib/flags";
import { listParents, listSteps, type Parent } from "@/lib/data/steps";
import { countryVisits } from "@/lib/budgetV2";
import { findCountry } from "@/lib/countries";
import { queryKeys, readQuery, writeQuery } from "@/lib/offline/queryCache";
import { barScale, stepsOn, totalBetween, weekBars, type StepRow } from "@/lib/stepsView";
import { formatWeekdayNarrow, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay } from "@/lib/types";

const t = strings.steps;
const noop = () => () => {};
const fmt = (n: number) => n.toLocaleString("he-IL");
const TONES = ["var(--brand)", "var(--accent-gold)"];
const DAY_MS = 86_400_000;

type Cached = { parents: Parent[]; rows: StepRow[] };

/**
 * Steps counter (Phase 2) on the in-trip Home, parents only: today per parent,
 * the week as paired bars, and the total for the current country stay.
 * Cache-first; the card hides itself when the flag is off or nothing is set up.
 */
export function StepsCard({ tripId }: { tripId: string }) {
  const on = useSyncExternalStore(noop, () => isEnabled("stepsCounter"), () => false);
  const [data, setData] = useState<Cached | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const today = todayISO();
  const stay = countryVisits(days).find((v) => v.from <= today && v.to >= today) ?? null;

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
    const since = stay && stay.from < from ? stay.from : from;
    void readQuery<{ days: ItineraryDay[] }>(queryKeys.itinerary(tripId)).then((hit) => {
      if (alive && hit?.data.days) setDays(hit.data.days);
    });
    void readQuery<Cached>(queryKeys.steps(tripId)).then((hit) => {
      if (alive && hit) setData(hit.data);
    });
    void (async () => {
      try {
        const parents = await listParents(tripId);
        const rows = await listSteps(parents.map((p) => p.id), since, today);
        if (!alive) return;
        setData({ parents, rows });
        void writeQuery(queryKeys.steps(tripId), { parents, rows });
      } catch {
        // offline or tables not there yet - cached data (if any) stays
      }
    })();
    return () => {
      alive = false;
    };
  }, [on, tripId, today, stay?.from]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on || !data || data.parents.length === 0) return null;
  const ids = data.parents.map((p) => p.id);
  const week = weekBars(data.rows, ids, today);
  const max = barScale(week);
  // No reports this week: names + "not reported" only, no row of empty bars.
  const anyWeek = week.some((d) => ids.some((id) => (d.steps[id] ?? 0) > 0));
  const place = stay ? findCountry(stay.code)?.he ?? stay.code : null;

  return (
    <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <p className="ot-kicker">{t.title}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {data.parents.map((p, i) => {
          const n = stepsOn(data.rows, p.id, today);
          return (
            <div key={p.id}>
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: TONES[i % 2] }} />
                {p.name}
              </p>
              <p className="text-[24px] font-extrabold leading-8 tabular-nums text-ink">{n === null ? <span className="text-sm font-semibold text-ink-soft">{t.notReported}</span> : fmt(n)}</p>
              {stay && place && (
                <p className="text-[12px] text-ink-soft">{t.stay.replace("{place}", place).replace("{n}", fmt(totalBetween(data.rows, p.id, stay.from, today)))}</p>
              )}
            </div>
          );
        })}
      </div>
      {anyWeek && (
      <figure className="mt-3" aria-label={t.weekAria}>
        <div className="flex h-16 items-end justify-between gap-1.5" dir="ltr">
          {week.map((d) => (
            <div key={d.date} className="flex h-full flex-1 items-end justify-center gap-0.5">
              {ids.map((id, i) => (
                <span
                  key={id}
                  className="w-2 rounded-t"
                  style={{ height: `${Math.max(2, (d.steps[id] / max) * 100)}%`, background: TONES[i % 2], opacity: d.steps[id] ? 1 : 0.25 }}
                />
              ))}
            </div>
          ))}
        </div>
        <figcaption className="mt-1 flex justify-between gap-1.5 text-[12px] text-ink-soft" dir="ltr">
          {week.map((d) => (
            <span key={d.date} className="flex-1 text-center">{formatWeekdayNarrow(d.date)}</span>
          ))}
        </figcaption>
      </figure>
      )}
    </section>
  );
}
