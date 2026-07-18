"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { listDays } from "@/lib/data/itinerary";
import {
  addRecommendationToDay,
  deleteSavedRecommendation,
  fetchRecommendations,
  listSavedRecommendations,
  saveRecommendation,
  type Recommendation,
} from "@/lib/data/recommendations";
import { getActiveTrip } from "@/lib/data/trip";
import { formatShortDate, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { ItineraryDay, SavedRecommendation, Trip } from "@/lib/types";

const CATEGORY_ICON: Record<string, string> = {
  מסעדה: "🍽️",
  אטרקציה: "🎡",
  פארק: "🌳",
  מוזיאון: "🏛️",
  חנות: "🛍️",
  טיפ: "💡",
};

function icon(category: string | null): string {
  return (category && CATEGORY_ICON[category]) || "📍";
}

export function RecommendScreen() {
  const s = strings.recommend;
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [saved, setSaved] = useState<SavedRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dayFor, setDayFor] = useState<Recommendation | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) return;
      setTrip(activeTrip);
      const [d, sv] = await Promise.all([
        listDays(activeTrip.id).catch(() => []),
        listSavedRecommendations(activeTrip.id).catch(() => []),
      ]);
      if (cancelled) return;
      setDays(d);
      setSaved(sv);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = useCallback(
    async (params: Parameters<typeof fetchRecommendations>[0]) => {
      setLoading(true);
      setResults(null);
      try {
        const recs = await fetchRecommendations(params);
        setResults(recs);
      } catch {
        showToast(s.error);
      } finally {
        setLoading(false);
      }
    },
    [s.error, showToast]
  );

  const fromLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast(s.needLocation);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // country of today's day, if we have it, helps the model
        const today = days.find((d) => d.date === todayISO());
        void runSearch({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          country_code: today?.country_code ?? null,
        });
      },
      () => {
        setLoading(false);
        showToast(s.locationDenied);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [days, runSearch, s.locationDenied, s.needLocation, showToast]);

  const fromDay = useCallback(
    (day: ItineraryDay) => {
      if (day.lat == null || day.lng == null) {
        void runSearch({
          area_name: day.location_name,
          country_code: day.country_code,
        });
        return;
      }
      void runSearch({
        lat: day.lat,
        lng: day.lng,
        area_name: day.location_name,
        country_code: day.country_code,
      });
    },
    [runSearch]
  );

  const onSaveMaybe = useCallback(
    async (rec: Recommendation) => {
      if (!trip) return;
      try {
        await saveRecommendation(trip.id, rec);
        setSaved(await listSavedRecommendations(trip.id));
        showToast(s.savedMaybe);
      } catch {
        showToast(s.error);
      }
    },
    [s.error, s.savedMaybe, showToast, trip]
  );

  const onAddToDay = useCallback(
    async (day: ItineraryDay) => {
      if (!dayFor) return;
      try {
        await addRecommendationToDay(day.id, dayFor);
        showToast(s.addedToItinerary);
      } catch {
        showToast(s.error);
      } finally {
        setDayFor(null);
      }
    },
    [dayFor, s.addedToItinerary, s.error, showToast]
  );

  const onRemoveSaved = useCallback(
    async (id: string) => {
      if (!trip) return;
      try {
        await deleteSavedRecommendation(id);
        setSaved((prev) => prev.filter((r) => r.id !== id));
      } catch {
        showToast(s.error);
      }
    },
    [s.error, showToast, trip]
  );

  if (memberLoading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-slate-500">
        {s.ownersOnly}
      </div>
    );
  }

  const daysWithPlace = days.filter((d) => d.location_name || d.lat != null);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pt-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
      </header>

      {/* triggers */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={fromLocation}
          disabled={loading}
          className="w-full rounded-2xl bg-teal-600 py-3.5 font-semibold text-white shadow-sm disabled:opacity-50"
        >
          📍 {s.useLocation}
        </button>
        {daysWithPlace.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-700">
              🗓️ {s.useDay}
            </summary>
            <ul className="divide-y divide-slate-100">
              {daysWithPlace.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => fromDay(d)}
                    disabled={loading}
                    className="flex w-full items-center justify-between px-4 py-3 text-right text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-700">
                      {d.location_name || formatShortDate(d.date)}
                    </span>
                    <span className="text-xs text-slate-400">{formatShortDate(d.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {loading && (
        <p className="py-6 text-center text-sm text-slate-500">{s.finding}</p>
      )}

      {/* results */}
      {results && results.length === 0 && !loading && (
        <p className="py-6 text-center text-sm text-slate-500">{s.empty}</p>
      )}
      {results && results.length > 0 && (
        <ul className="space-y-3">
          {results.map((rec, i) => (
            <li
              key={`${rec.title}-${i}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <span className="text-2xl" aria-hidden="true">{icon(rec.category)}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">{rec.title}</h3>
                  {rec.location_name && (
                    <p className="text-xs text-slate-400">{rec.location_name}</p>
                  )}
                </div>
              </div>
              {rec.description && (
                <p className="mt-2 text-sm text-slate-600">{rec.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => (days.length ? setDayFor(rec) : showToast(s.noDays))}
                  className="rounded-xl bg-teal-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  + {s.addToItinerary}
                </button>
                <button
                  type="button"
                  onClick={() => onSaveMaybe(rec)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
                >
                  ☆ {s.saveMaybe}
                </button>
                {rec.maps_url && (
                  <a
                    href={rec.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
                  >
                    🗺️ {s.openInMaps}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* maybe-list */}
      <section>
        <h2 className="mb-2 mt-2 text-sm font-semibold text-slate-700">
          ☆ {s.maybeListTitle}
        </h2>
        {saved.length === 0 ? (
          <p className="text-sm text-slate-400">{s.maybeEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {saved.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800">
                    {icon(r.category)} {r.title}
                  </p>
                  {r.description && (
                    <p className="text-xs text-slate-500">{r.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {days.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDayFor({
                          title: r.title,
                          category: r.category,
                          description: r.description,
                          location_name: r.location_name,
                          lat: r.lat,
                          lng: r.lng,
                          place_id: r.place_id,
                          country_code: r.country_code,
                          maps_url: r.maps_url,
                        })
                      }
                      className="text-xs font-medium text-teal-600"
                    >
                      + {s.addToItinerary}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveSaved(r.id)}
                    className="text-xs text-rose-500"
                  >
                    {s.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* day picker for "add to itinerary" */}
      <Sheet open={dayFor !== null} onClose={() => setDayFor(null)} title={s.addDayPrompt}>
        {days.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{s.noDays}</p>
        ) : (
          <ul className="space-y-1">
            {days.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onAddToDay(d)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-right hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-700">
                    {d.location_name || formatShortDate(d.date)}
                  </span>
                  <span className="text-xs text-slate-400">{formatShortDate(d.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
