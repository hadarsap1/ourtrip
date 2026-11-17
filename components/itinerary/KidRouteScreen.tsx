"use client";

import { useEffect, useState } from "react";
import { getActiveTrip } from "@/lib/data/trip";
import { listDays, listItems } from "@/lib/data/itinerary";
import { buildKidRoute, type KidStop } from "@/lib/kidRoute";
import { findCountry } from "@/lib/countries";
import { formatShortDate, formatTime, todayISO } from "@/lib/format";
import { PinIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import { Banner } from "@/components/ui/Banner";
import { readQuery, writeQuery } from "@/lib/offline/queryCache";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

/**
 * The route for the kids' tablet: where we are now and where we go next,
 * read-only. Days and plans only - kids have no policy on bookings, prices or
 * the options bank, and nothing here can be edited (RLS: select only).
 */
export function KidRouteScreen() {
  const [stops, setStops] = useState<KidStop[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const trip = await getActiveTrip();
        if (!trip) {
          if (!cancelled) setStops([]);
          return;
        }
        const today = todayISO();
        // The route is what a kid opens in the car: the last one fetched is
        // kept on the tablet and shown with no network (QA 15/11/2026).
        const cacheKey = `kid-route:${trip.id}`;
        try {
          const days = (await listDays(trip.id)).filter((d) => d.date >= today);
          const items = await listItems(days.map((d) => d.id));
          if (!cancelled) setStops(buildKidRoute(days, items, today));
          void writeQuery(cacheKey, { days, items });
        } catch (err) {
          const cached = await readQuery<{ days: ItineraryDay[]; items: ItineraryItem[] }>(cacheKey);
          if (!cached) throw err;
          if (!cancelled) {
            // days that have passed since the copy was saved drop out
            const days = cached.data.days.filter((d) => d.date >= today);
            const ids = new Set(days.map((d) => d.id));
            setStops(buildKidRoute(days, cached.data.items.filter((i) => ids.has(i.day_id)), today));
            setFromCache(true);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeName = (s: KidStop) => s.place ?? (s.countryCode ? (findCountry(s.countryCode)?.he ?? s.countryCode) : "");

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-10 sm:max-w-2xl">
      <header>
        <h1 className="text-3xl font-bold">{strings.kidRoute.title}</h1>
        <p className="mt-1 text-ink-soft">{strings.kidRoute.subtitle}</p>
      </header>

      {fromCache && <Banner tone="warning">{strings.offline.fromCache}</Banner>}

      {failed ? (
        <p className="rounded-card border border-line bg-surface p-6 text-center text-ink-soft">
          {strings.kidRoute.loadFailed}
        </p>
      ) : stops === null ? (
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      ) : stops.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-8 text-center text-lg text-ink-soft">
          {strings.kidRoute.empty}
        </p>
      ) : (
        <ol className="space-y-3">
          {stops.map((stop) => {
            const flag = stop.countryCode ? findCountry(stop.countryCode)?.flag : null;
            return (
              <li
                key={stop.key}
                className={`rounded-card p-4 ${
                  stop.isNow ? "bg-sea text-on-sea" : "border border-line bg-surface text-ink"
                }`}
              >
                {stop.isNow && (
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-bold opacity-90">
                    <PinIcon className="h-4 w-4" />
                    {strings.kidRoute.now}
                  </p>
                )}
                <p className="flex items-center gap-2 text-2xl font-bold">
                  {flag && <span aria-hidden>{flag}</span>}
                  <span>{placeName(stop)}</span>
                </p>
                <p className={`mt-0.5 text-base ${stop.isNow ? "opacity-90" : "text-ink-soft"}`}>
                  <span dir="ltr">
                    {stop.from === stop.to
                      ? formatShortDate(stop.from)
                      : `${formatShortDate(stop.from)} - ${formatShortDate(stop.to)}`}
                  </span>
                  {" · "}
                  {stop.dayCount === 1
                    ? strings.kidRoute.oneDay
                    : strings.kidRoute.days.replace("{n}", String(stop.dayCount))}
                </p>
                {stop.plannedDays.length > 0 && (
                  <ul className={`mt-3 space-y-2 border-t pt-3 ${stop.isNow ? "border-white/30" : "border-line"}`}>
                    {stop.plannedDays.map((d) => (
                      <li key={d.date}>
                        <p className="text-sm font-bold" dir="ltr">
                          {formatShortDate(d.date)}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {d.items.map((i) => (
                            <li key={i.id} className="flex items-baseline gap-2 text-lg">
                              {i.time && (
                                <span className="shrink-0 text-sm font-bold tabular-nums" dir="ltr">
                                  {formatTime(i.time)}
                                </span>
                              )}
                              <span>{i.title}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
