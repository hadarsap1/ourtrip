"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTodayMapSnapshotUrl } from "@/lib/data/map";
import { loadToday, type TodayData } from "@/lib/data/today";
import {
  describeWeather,
  getDayWeather,
  type DayWeather,
} from "@/lib/data/weather";
import { formatDate, formatMoney, formatTime, formatWeekday } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

const BOOKING_ICON: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  train: "🚆",
  attraction: "🎡",
  car_rental: "🚗",
  other: "📌",
};

export function TodayScreen() {
  const [result, setResult] = useState<{
    data: TodayData;
    fromCache: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadToday().then((r) => {
      if (cancelled) return;
      setResult(r);
      setLoading(false);
      if (!r) return;
      // weather for today's location (Open-Meteo, cached)
      const day = r.data.day;
      if (day?.lat != null && day.lng != null) {
        void getDayWeather(r.data.date, day.lat, day.lng).then((w) => {
          if (!cancelled) setWeather(w);
        });
      }
      // mini-map: static snapshot of today's item area, cached offline
      void getTodayMapSnapshotUrl(r.data.items).then((url) => {
        if (!cancelled) setMapUrl(url);
        else if (url) URL.revokeObjectURL(url);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const headerDate = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const { member } = useMember();
  const data = result?.data ?? null;
  const activeItems = data?.items.filter((i) => i.status !== "cancelled") ?? [];

  // ---------- guest portal home ----------
  if (member?.role === "guest") {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-8 pb-8">
        <h1 className="text-2xl font-bold">{strings.guestHome.welcome}</h1>
        <p className="text-sm text-slate-500">{strings.guestHome.subtitle}</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <Link href="/photos" className="rounded-2xl bg-white p-6 shadow-sm">
            <span className="block text-4xl" aria-hidden="true">📷</span>
            <span className="mt-2 block font-semibold text-slate-700">
              {strings.guestHome.tilePhotos}
            </span>
          </Link>
          <Link href="/journal" className="rounded-2xl bg-white p-6 shadow-sm">
            <span className="block text-4xl" aria-hidden="true">📖</span>
            <span className="mt-2 block font-semibold text-slate-700">
              {strings.guestHome.tileJournal}
            </span>
          </Link>
          <Link href="/map" className="rounded-2xl bg-white p-6 shadow-sm">
            <span className="block text-4xl" aria-hidden="true">🗺️</span>
            <span className="mt-2 block font-semibold text-slate-700">
              {strings.guestHome.tileMap}
            </span>
          </Link>
          <Link href="/messages" className="rounded-2xl bg-white p-6 shadow-sm">
            <span className="block text-4xl" aria-hidden="true">💬</span>
            <span className="mt-2 block font-semibold text-slate-700">
              {strings.guestHome.tileWall}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // ---------- kid home variant (SPEC 2.1) ----------
  if (member?.role === "kid") {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8">
        <header className="flex items-start justify-between">
          <h1 className="text-3xl font-bold">
            {strings.kidHome.hello} {member.display_name}! 👋
          </h1>
          <Link
            href="/emergency"
            aria-label={strings.emergency.title}
            className="rounded-2xl bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow"
          >
            🆘 {strings.emergency.sos}
          </Link>
        </header>

        <section className="rounded-2xl bg-teal-600 p-4 text-white shadow">
          <p className="text-sm font-medium opacity-80">
            {strings.kidHome.whereToday}
          </p>
          <p className="mt-1 text-2xl font-bold">
            📍 {data?.day?.location_name ?? strings.kidHome.noLocation}
          </p>
          {weather && (
            <p className="mt-1 text-lg" dir="ltr">
              {describeWeather(weather.weatherCode).icon} {weather.tempMin}–
              {weather.tempMax}°
            </p>
          )}
        </section>

        {activeItems.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {activeItems.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                  <span className="w-14 shrink-0 text-sm font-bold tabular-nums text-teal-700" dir="ltr">
                    {item.start_time ? formatTime(item.start_time) : "—"}
                  </span>
                  <span
                    className={`text-lg font-medium ${
                      item.status === "done"
                        ? "text-slate-400 line-through"
                        : "text-slate-800"
                    }`}
                  >
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* daily journal prompt */}
        <Link
          href="/journal"
          className="block rounded-2xl bg-amber-100 p-4 shadow-sm"
        >
          <p className="text-lg font-bold text-amber-900">
            ✏️ {strings.kidHome.journalPrompt}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-amber-700">
            {strings.kidHome.journalCta} ←
          </p>
        </Link>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Link href="/photos" className="rounded-2xl bg-white p-4 shadow-sm">
            <span className="block text-3xl" aria-hidden="true">📷</span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              {strings.kidHome.tilePhotos}
            </span>
          </Link>
          <Link href="/pocket" className="rounded-2xl bg-white p-4 shadow-sm">
            <span className="block text-3xl" aria-hidden="true">🪙</span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              {strings.kidHome.tilePocket}
            </span>
          </Link>
          <Link href="/phrasebook" className="rounded-2xl bg-white p-4 shadow-sm">
            <span className="block text-3xl" aria-hidden="true">💬</span>
            <span className="mt-1 block text-sm font-semibold text-slate-700">
              {strings.kidHome.tilePhrasebook}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{strings.nav.today}</h1>
          <p className="text-sm text-slate-500">{headerDate}</p>
          {data?.day?.location_name && (
            <p className="mt-0.5 text-sm font-semibold text-teal-700">
              📍 {data.day.location_name}
            </p>
          )}
        </div>
        {/* one-tap emergency access (Sprint 4) */}
        <Link
          href="/emergency"
          aria-label={strings.emergency.title}
          className="rounded-2xl bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-rose-700"
        >
          🆘 {strings.emergency.sos}
        </Link>
      </header>

      {result?.fromCache && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
          {strings.offline.fromCache}
          {data && ` · ${strings.today.snapshotFrom} ${formatDate(data.date)}`}
        </p>
      )}

      {loading ? (
        <p className="pt-4 text-center text-slate-500">{strings.common.loading}</p>
      ) : !data || !data.day ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">{strings.today.emptyTitle}</h2>
          <p className="text-sm text-slate-500">
            {data && !data.day ? strings.today.noDay : strings.today.emptyBody}
          </p>
        </section>
      ) : (
        <>
          {/* rain alert: >50% chance + outdoor items today (Sprint 5) */}
          {weather &&
            weather.precipitationChance > 50 &&
            activeItems.some((i) => i.is_outdoor) && (
              <p className="rounded-xl bg-amber-100 px-3 py-2.5 text-center text-sm font-semibold text-amber-800">
                ⚠️ {strings.weather.rainAlert} ({weather.precipitationChance}%)
              </p>
            )}

          {/* weather for today's location */}
          {weather && (
            <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">
                  {describeWeather(weather.weatherCode).icon}
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {describeWeather(weather.weatherCode).label}
                </span>
              </span>
              <span className="text-end">
                <span className="block text-lg font-bold text-slate-800" dir="ltr">
                  {weather.tempMin}–{weather.tempMax}°
                </span>
                {weather.precipitationChance > 0 && (
                  <span className="text-xs text-slate-400" dir="ltr">
                    💧{weather.precipitationChance}% {""}
                  </span>
                )}
              </span>
            </section>
          )}

          {/* mini-map of today's area (static snapshot, cached offline) */}
          {mapUrl && (
            <Link href="/map" className="block overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URL snapshot */}
              <img
                src={mapUrl}
                alt={strings.more.menuMap}
                className="h-40 w-full object-cover"
              />
            </Link>
          )}

          {/* today's items, time order */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {activeItems.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">
                {strings.itinerary.emptyDayItems}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activeItems.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                    <span
                      className="w-14 shrink-0 text-sm font-bold tabular-nums text-teal-700"
                      dir="ltr"
                    >
                      {item.start_time ? formatTime(item.start_time) : "—"}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block font-medium ${
                          item.status === "done"
                            ? "text-slate-400 line-through"
                            : "text-slate-800"
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.location_name && (
                        <span className="text-xs text-slate-400">
                          {item.location_name}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* today's bookings (tonight's hotel etc.) */}
          {data.bookings.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h2 className="mb-1 px-1 text-sm font-semibold text-slate-500">
                {strings.today.bookingsToday}
              </h2>
              <ul className="divide-y divide-slate-100">
                {data.bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-baseline justify-between gap-2 px-1 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      <span aria-hidden="true">
                        {BOOKING_ICON[booking.type] ?? "📌"}
                      </span>{" "}
                      {booking.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500" dir="ltr">
                      {booking.confirmation_code ??
                        (booking.cost != null
                          ? formatMoney(booking.cost, booking.currency ?? "ILS")
                          : "")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.day.notes && (
            <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-900">
              {data.day.notes}
            </p>
          )}

          <p className="text-center text-xs text-slate-400">
            {formatWeekday(data.date)} {formatDate(data.date)}
            {data.day.country_code ? ` · ${data.day.country_code}` : ""}
          </p>
        </>
      )}

      {/* quick actions (SPEC 2.1) */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/budget"
          className="rounded-2xl bg-teal-600 py-3 text-center font-semibold text-white shadow hover:bg-teal-700"
        >
          {strings.today.quickExpense}
        </Link>
        <Link
          href="/itinerary"
          className="rounded-2xl border border-teal-600 py-3 text-center font-semibold text-teal-700 hover:bg-teal-50"
        >
          {strings.today.quickItinerary}
        </Link>
      </div>
    </div>
  );
}
