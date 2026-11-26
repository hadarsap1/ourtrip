"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isEnabled } from "@/lib/flags";
import { listParents, listSteps, type Parent } from "@/lib/data/steps";
import { requestHome } from "@/lib/data/homeRpc";
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
// the first parent green, the second coral (קרם חם legend)
const TONES = ["var(--brand)", "var(--coral)"];
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
        // the home's one request (00107) carries the parents and their steps;
        // asked on its own only when it reaches back less far than this stay
        const home = await requestHome();
        const fromHome = home && home.tripId === tripId && home.stepsFrom <= since ? home : null;
        const parents = fromHome ? fromHome.parents : await listParents(tripId);
        const rows = fromHome
          ? fromHome.steps.filter((r) => r.date >= since)
          : await listSteps(parents.map((p) => p.id), since, today);
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

  const anyToday = ids.some((id) => stepsOn(data.rows, id, today) !== null);

  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3.5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-extrabold text-ink">{t.title}</h2>
        <ul className="flex flex-wrap gap-3 text-[13px] text-muted">
          {data.parents.map((p, i) => {
            const n = stepsOn(data.rows, p.id, today);
            return (
              <li key={p.id} className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: TONES[i % 2] }} />
                {p.name}
                {n !== null && <bdi className="font-bold tabular-nums text-ink">{fmt(n)}</bdi>}
              </li>
            );
          })}
        </ul>
      </div>
      {anyWeek && (
        <figure className="mt-2.5" aria-label={t.weekAria}>
          <div className="flex h-[100px] items-end justify-between gap-1" dir="ltr">
            {week.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full items-end justify-center gap-0.5">
                  {ids.map((id, i) => (
                    <span
                      key={id}
                      className="w-3 rounded-md"
                      style={{ height: `${Math.max(4, (d.steps[id] / max) * 100)}%`, background: TONES[i % 2], opacity: d.steps[id] ? 1 : 0.25 }}
                    />
                  ))}
                </div>
                <span className="text-[13px] text-muted">{formatWeekdayNarrow(d.date)}</span>
              </div>
            ))}
          </div>
        </figure>
      )}
      {!anyToday && <p className="mt-2 text-[13px] text-muted">{t.notReportedToday}</p>}
      {stay && place && (
        <p className="mt-1 text-[13px] text-muted">
          {data.parents
            .map((p) => `${p.name}: ${fmt(totalBetween(data.rows, p.id, stay.from, today))}`)
            .join(" · ")}{" "}
          <span>({t.stayShort.replace("{place}", place)})</span>
        </p>
      )}
    </section>
  );
}
