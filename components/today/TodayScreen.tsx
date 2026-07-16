"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadToday, type TodayData } from "@/lib/data/today";
import { formatDate, formatMoney, formatTime, formatWeekday } from "@/lib/format";
import { strings } from "@/lib/strings";

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

  useEffect(() => {
    let cancelled = false;
    void loadToday().then((r) => {
      if (cancelled) return;
      setResult(r);
      setLoading(false);
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

  const data = result?.data ?? null;
  const activeItems = data?.items.filter((i) => i.status !== "cancelled") ?? [];

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
