"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountdownHome } from "./CountdownHome";
import { KidFactCard } from "@/components/facts/KidFactCard";
import {
  BedIcon,
  CameraIcon,
  CoinIcon,
  DocumentIcon,
  JournalIcon,
  MapIcon,
  MessagesIcon,
  PhotosIcon,
  PhrasebookIcon,
  PinIcon,
  PlusIcon,
  RouteIcon,
  SparkleIcon,
  WeatherIcon,
} from "@/components/icons";
import { loadToday, type TodayData } from "@/lib/data/today";
import {
  loadTodayDashboard,
  type TodayDashboard,
} from "@/lib/data/todayDashboard";
import { getTodayMapSnapshotUrl } from "@/lib/data/map";
import {
  describeWeather,
  getDayWeather,
  type DayWeather,
} from "@/lib/data/weather";
import { formatDate, formatMoney, formatTime, formatWeekday, todayISO } from "@/lib/format";
import { daysUntil } from "@/lib/data/readiness";
import { getActiveTrip } from "@/lib/data/trip";
import { strings } from "@/lib/strings";
import { currentItemId, minutesNow, nextUp } from "@/lib/tripDay";
import { useMember } from "@/lib/useMember";
import type { Booking, ItineraryItem, Trip } from "@/lib/types";

/** Tonight's bed: the lodging booking covering today, if there is one. */
function tonightsLodging(bookings: Booking[]): Booking | null {
  return bookings.find((b) => b.type === "hotel") ?? null;
}

/** "בעוד 40 דקות" / "בעוד 3 שעות" / "עכשיו" */
function countdownLabel(minutes: number): string {
  if (minutes < 1) return strings.today.nowLabel;
  if (minutes < 60)
    return strings.today.inMinutes.replace("{n}", String(minutes));
  return strings.today.inHours.replace("{n}", String(Math.round(minutes / 60)));
}

/* -------------------------------------------------------------------------- */
/*  Owner dashboard pieces                                                     */
/* -------------------------------------------------------------------------- */

function Tile({
  label,
  children,
  tone = "plain",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "plain" | "sun";
}) {
  return (
    <div
      className={`rounded-[18px] border px-3.5 py-3 ${
        tone === "sun"
          ? "border-sun/20 bg-sun-tint"
          : "border-line bg-white"
      }`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-[0.09em] ${
          tone === "sun" ? "text-sun-deep" : "text-ink-soft"
        }`}
      >
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ProgressBar({
  ratio,
  tone = "sea",
}: {
  ratio: number;
  tone?: "sea" | "sun";
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full ${tone === "sun" ? "bg-sun" : "bg-sea"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AgendaCard({
  items,
  nowMinutes,
}: {
  items: ItineraryItem[];
  nowMinutes: number;
}) {
  const currentId = currentItemId(items, nowMinutes);
  return (
    <section className="overflow-hidden rounded-[18px] border border-line bg-white">
      <header className="flex items-center justify-between bg-paper-deep px-3.5 py-2.5">
        <h2 className="text-xs font-bold text-ink">{strings.today.agenda}</h2>
        <span className="text-[10.5px] text-ink-soft">
          {strings.today.agendaCount.replace("{n}", String(items.length))}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-ink-soft">
          {strings.itinerary.emptyDayItems}
        </p>
      ) : (
        <ul>
          {items.map((item) => {
            const done = item.status === "done";
            const current = item.id === currentId;
            return (
              <li
                key={item.id}
                className={`flex items-center gap-[11px] border-t border-line px-3.5 py-2.5 ${
                  current ? "bg-sea-tint" : ""
                }`}
              >
                <span
                  className={`w-[42px] shrink-0 text-[12.5px] font-bold tabular-nums ${
                    done
                      ? "text-ink-faint"
                      : current
                        ? "text-sea-deep"
                        : "text-sea"
                  }`}
                  dir="ltr"
                >
                  {item.start_time ? formatTime(item.start_time) : "-"}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                    done
                      ? "bg-line"
                      : current
                        ? "bg-sea"
                        : "border-[1.5px] border-sea"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13.5px] ${
                      done
                        ? "text-ink-faint line-through"
                        : current
                          ? "font-bold text-sea-deep"
                          : "font-medium text-ink"
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.location_name && (
                    <span className="block truncate text-[10.5px] text-ink-soft">
                      {item.location_name}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function TodayScreen() {
  const [result, setResult] = useState<{
    data: TodayData;
    fromCache: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<TodayDashboard | null>(null);
  // Needed only to decide which home screen this is: before departure the
  // itinerary has no day for "today" and the dashboard below has nothing to
  // show, so the countdown takes over.
  const [trip, setTrip] = useState<Trip | null>(null);
  // Separate from `trip` because null is a real answer (no trip configured),
  // and rendering the dashboard before this settles would flash the empty card
  // for a moment before the countdown replaced it.
  const [tripChecked, setTripChecked] = useState(false);
  // Re-derives "next up" and the current agenda row as the day moves on.
  const [now, setNow] = useState(() => minutesNow());

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
    // budget/photo tiles are an enhancement - null when offline, and the
    // itinerary above them renders regardless
    void loadTodayDashboard().then((d) => {
      if (!cancelled) setDashboard(d);
    });
    // getActiveTrip caches and collapses in-flight calls, and loadToday above
    // asks for the same thing, so this resolves on that round trip rather than
    // costing another.
    void getActiveTrip()
      .then((t) => {
        if (!cancelled) setTrip(t);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTripChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(minutesNow()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const { member } = useMember();
  const data = result?.data ?? null;
  const activeItems = data?.items.filter((i) => i.status !== "cancelled") ?? [];

  // ---------- guest portal home ----------
  if (member?.role === "guest") {
    const tiles = [
      { href: "/photos", Icon: PhotosIcon, label: strings.guestHome.tilePhotos },
      { href: "/journal", Icon: JournalIcon, label: strings.guestHome.tileJournal },
      { href: "/map", Icon: MapIcon, label: strings.guestHome.tileMap },
      { href: "/messages", Icon: MessagesIcon, label: strings.guestHome.tileWall },
    ];
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-8 pb-8 sm:max-w-2xl">
        <h1 className="text-2xl font-bold">{strings.guestHome.welcome}</h1>
        <p className="text-sm text-ink-soft">{strings.guestHome.subtitle}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex flex-col items-center gap-2.5 rounded-[18px] border border-line bg-white p-6 active:bg-sea-tint/50"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sea-tint text-sea-deep">
                <tile.Icon className="h-6 w-6" />
              </span>
              <span className="font-semibold text-ink">{tile.label}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ---------- kid home variant (SPEC 2.1) ----------
  if (member?.role === "kid") {
    const kidTiles = [
      { href: "/photos", Icon: PhotosIcon, label: strings.kidHome.tilePhotos },
      { href: "/pocket", Icon: CoinIcon, label: strings.kidHome.tilePocket },
      {
        href: "/phrasebook",
        Icon: PhrasebookIcon,
        label: strings.kidHome.tilePhrasebook,
      },
      {
        href: "/facts",
        Icon: SparkleIcon,
        label: strings.kidHome.tileFacts,
      },
      {
        href: "/documents",
        Icon: DocumentIcon,
        label: strings.kidHome.tileDocuments,
      },
    ];
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8 sm:max-w-2xl">
        <header className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-bold">
            {strings.kidHome.hello} {member.display_name}!
          </h1>
          <Link
            href="/emergency"
            aria-label={strings.emergency.title}
            className="shrink-0 rounded-2xl bg-alert px-3 py-2 text-sm font-bold text-white"
          >
            {strings.emergency.sos}
          </Link>
        </header>

        <section className="rounded-[20px] bg-sea p-4 text-white">
          <p className="text-sm font-medium opacity-80">
            {strings.kidHome.whereToday}
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <PinIcon className="h-6 w-6 shrink-0 opacity-80" />
            {data?.day?.location_name ?? strings.kidHome.noLocation}
          </p>
          {weather && (
            <p className="mt-1.5 flex items-center gap-2 text-lg">
              <WeatherIcon
                code={weather.weatherCode}
                className="h-6 w-6 opacity-90"
              />
              <span dir="ltr">
                {weather.tempMin}-{weather.tempMax}°
              </span>
            </p>
          )}
        </section>

        {activeItems.length > 0 && (
          <section className="rounded-[20px] border border-line bg-white">
            <ul className="divide-y divide-line">
              {activeItems.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3 px-4 py-3">
                  <span
                    className="w-14 shrink-0 text-sm font-bold tabular-nums text-sea"
                    dir="ltr"
                  >
                    {item.start_time ? formatTime(item.start_time) : "-"}
                  </span>
                  <span
                    className={`text-lg font-medium ${
                      item.status === "done"
                        ? "text-ink-faint line-through"
                        : "text-ink"
                    }`}
                  >
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* One fact about where they are, or nothing at all when there is no
            fact for this destination yet. */}
        {trip?.id && <KidFactCard tripId={trip.id} />}

        {/* daily journal prompt */}
        <Link
          href="/journal"
          className="block rounded-[20px] bg-sun-tint p-4 text-sun-deep"
        >
          <p className="text-lg font-bold">{strings.kidHome.journalPrompt}</p>
          <p className="mt-0.5 text-sm font-bold">
            {strings.kidHome.journalCta} ←
          </p>
        </Link>

        <div className="grid grid-cols-2 gap-2.5">
          {kidTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex flex-col items-center gap-2 rounded-[18px] border border-line bg-white p-4 active:bg-sea-tint/50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-sea-tint text-sea-deep">
                <tile.Icon className="h-[22px] w-[22px]" />
              </span>
              <span className="text-sm font-semibold text-ink">{tile.label}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- owner, before departure: the countdown ----------
     Until 03.11.2026 the itinerary has no day for "today", so the dashboard
     below renders an empty card - which is what every open of the app has
     shown for weeks. Between now and then the useful home screen is what still
     has to happen before the flight. Switches over on its own on the day the
     trip starts; no setting to forget. */
  if (!tripChecked) {
    return (
      <div
        className="mx-auto max-w-lg px-4 pt-16 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const startsIn = trip ? daysUntil(todayISO(), trip.start_date) : null;
  if (trip && startsIn !== null && startsIn > 0) {
    return <CountdownHome trip={trip} />;
  }

  /* ---------- owner: dashboard (direction 1b) ---------- */

  const position = dashboard?.position ?? null;
  const upcoming = nextUp(activeItems, now);
  const lodging = data ? tonightsLodging(data.bookings) : null;
  const remaining = dashboard ? dashboard.budget - dashboard.spentTotal : null;
  // Built from what actually loaded: with no snapshot there is no date to
  // format, and formatting an empty one printed "Invalid Date" into the bar.
  const dayLine = [
    data ? `${formatWeekday(data.date)} ${formatDate(data.date)}` : null,
    position
      ? strings.today.dayOf
          .replace("{n}", String(position.day))
          .replace("{total}", String(position.total))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pb-8">
      {/* Place bar. Full-bleed and flat: at this height the postcard's dashed
          arc was noise, and a solid band reads as chrome rather than as content
          competing with the cards below. */}
      <header className="bg-sea-deep px-6 pb-3.5 pt-4 text-white">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3 sm:max-w-2xl lg:max-w-none">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-[19px] font-extrabold leading-tight">
              <PinIcon className="h-[17px] w-[17px] shrink-0 text-white/80" />
              <span className="truncate">
                {data?.day?.location_name ?? strings.today.noPlace}
                {data?.day?.country_code ? `, ${data.day.country_code}` : ""}
              </span>
            </h1>
            <p className="mt-1 text-[11.5px] text-white/70">{dayLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/budget"
              className="flex items-center gap-1 rounded-[10px] border border-white/28 bg-white/15 px-2.5 py-1.5 text-[11px] font-bold text-white active:bg-white/25"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {strings.today.addExpenseShort}
            </Link>
            <Link
              href="/emergency"
              aria-label={strings.emergency.title}
              className="rounded-[10px] border border-white/28 bg-white/15 px-2.5 py-1.5 text-[11px] font-extrabold tracking-[0.06em] text-white active:bg-white/25"
            >
              {strings.emergency.sos}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-3 sm:max-w-2xl lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_282px_282px] lg:items-start lg:gap-4 lg:px-9 lg:pt-6">
        {result?.fromCache && (
          <p className="mb-2.5 rounded-xl bg-sun-tint px-3 py-2 text-center text-xs font-medium text-sun-deep lg:col-span-3">
            {strings.offline.fromCache}
            {data && ` · ${strings.today.snapshotFrom} ${formatDate(data.date)}`}
          </p>
        )}

        {loading ? (
          <p className="pt-4 text-center text-ink-soft lg:col-span-3">
            {strings.common.loading}
          </p>
        ) : !data || !data.day ? (
          <section className="ot-card p-8 text-center lg:col-span-3">
            <RouteIcon className="mx-auto mb-3 h-9 w-9 text-line" />
            <h2 className="mb-2 text-lg font-semibold">
              {strings.today.emptyTitle}
            </h2>
            <p className="text-sm text-ink-soft">
              {data && !data.day ? strings.today.noDay : strings.today.emptyBody}
            </p>
          </section>
        ) : (
          <>
            {/* column 1: what's happening */}
            <div className="space-y-2.5 lg:space-y-3">
              {/* rain alert: >50% chance + outdoor items today (Sprint 5) */}
              {weather &&
                weather.precipitationChance > 50 &&
                activeItems.some((i) => i.is_outdoor) && (
                  <p className="rounded-[16px] bg-sun-tint px-3.5 py-2.5 text-center text-[12.5px] font-bold text-sun-deep">
                    {strings.weather.rainAlert} ({weather.precipitationChance}%)
                  </p>
                )}

              {upcoming && (
                <section
                  className="rounded-[18px] border border-line bg-white px-3.5 py-3"
                  style={{ boxShadow: "0 8px 20px -16px rgba(34,49,46,.4)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="ot-kicker">{strings.today.nextUp}</p>
                    <span className="text-[10.5px] font-medium text-ink-soft">
                      {countdownLabel(upcoming.minutesUntil)}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-baseline gap-2.5">
                    <span
                      className="shrink-0 text-[15px] font-extrabold tabular-nums text-sea"
                      dir="ltr"
                    >
                      {upcoming.item.start_time
                        ? formatTime(upcoming.item.start_time)
                        : ""}
                    </span>
                    <span className="min-w-0 truncate text-[16.5px] font-bold text-ink">
                      {upcoming.item.title}
                    </span>
                  </p>
                  {upcoming.item.location_name && (
                    <p className="mt-1 truncate text-[11px] text-ink-soft">
                      {upcoming.item.location_name}
                    </p>
                  )}
                </section>
              )}

              <AgendaCard items={activeItems} nowMinutes={now} />
            </div>

            {/* column 2: the four tiles */}
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:mt-0 lg:grid-cols-1 lg:gap-3">
              {weather && (
                <Tile label={strings.today.tileWeather}>
                  <p className="flex items-center gap-2">
                    <WeatherIcon
                      code={weather.weatherCode}
                      className="h-[22px] w-[22px] shrink-0 text-sun"
                    />
                    <span
                      className="text-[19px] font-extrabold leading-none text-ink"
                      dir="ltr"
                    >
                      {weather.tempMin}-{weather.tempMax}°
                    </span>
                  </p>
                  <p className="mt-1 truncate text-[11px] text-ink-soft">
                    {describeWeather(weather.weatherCode).label}
                    {weather.precipitationChance > 0 && (
                      <span dir="ltr"> · {weather.precipitationChance}%</span>
                    )}
                  </p>
                </Tile>
              )}

              <Tile label={strings.today.tileTonight}>
                {lodging ? (
                  <>
                    <p className="flex items-center gap-2">
                      <BedIcon className="h-[21px] w-[21px] shrink-0 text-sea" />
                      <span className="min-w-0 truncate text-sm font-bold text-ink">
                        {lodging.title}
                      </span>
                    </p>
                    {lodging.confirmation_code && (
                      <p
                        className="mt-1 truncate text-[11px] font-semibold text-ink-soft"
                        dir="ltr"
                      >
                        {lodging.confirmation_code}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-ink-faint">
                    {strings.today.noLodging}
                  </p>
                )}
              </Tile>

              {dashboard && (
                <Tile label={strings.today.tileSpentToday}>
                  <p className="text-[19px] font-extrabold leading-none text-ink">
                    {formatMoney(dashboard.spentToday, "ILS")}
                  </p>
                  {dashboard.budget > 0 && (
                    <ProgressBar
                      ratio={dashboard.spentTotal / dashboard.budget}
                    />
                  )}
                </Tile>
              )}

              {/* The screen's single sun-filled surface. One per screen. */}
              {dashboard && remaining !== null && (
                <Tile label={strings.today.tileRemaining} tone="sun">
                  {dashboard.budget > 0 ? (
                    <p
                      className={`text-[19px] font-extrabold leading-none ${
                        remaining < 0 ? "text-alert" : "text-sun-deep"
                      }`}
                    >
                      {formatMoney(remaining, "ILS")}
                    </p>
                  ) : (
                    <p className="text-[13px] text-sun-deep/70">
                      {strings.today.noBudget}
                    </p>
                  )}
                </Tile>
              )}
            </div>

            {/* column 3: memories and the map */}
            <div className="mt-2.5 space-y-2.5 lg:mt-0 lg:space-y-3">
              {dashboard && dashboard.photos.length > 0 && (
                <section>
                  <div className="mb-1.5 flex items-baseline justify-between px-0.5">
                    <h2 className="text-xs font-bold text-ink">
                      {strings.today.photosToday.replace(
                        "{n}",
                        String(dashboard.photos.length)
                      )}
                    </h2>
                    <Link
                      href="/photos"
                      className="text-[11px] font-bold text-sea"
                    >
                      {strings.today.seeAll} ←
                    </Link>
                  </div>
                  <ul className="flex gap-[7px] overflow-x-auto pb-1">
                    {dashboard.photos.slice(0, 8).map((photo) => (
                      <li key={photo.id} className="shrink-0">
                        <Link href="/photos" className="block">
                          {photo.url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                            <img
                              src={photo.url}
                              alt={photo.caption ?? ""}
                              className="h-[72px] w-[72px] rounded-xl object-cover"
                            />
                          ) : (
                            <span className="grid h-[72px] w-[72px] place-items-center rounded-xl bg-paper-deep">
                              <CameraIcon className="h-5 w-5 text-line" />
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* mini-map of today's area (static snapshot, cached offline) */}
              {mapUrl && (
                <Link
                  href="/map"
                  className="block overflow-hidden rounded-[18px] border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URL snapshot */}
                  <img
                    src={mapUrl}
                    alt={strings.more.menuMap}
                    className="h-40 w-full object-cover"
                  />
                </Link>
              )}

              {/* today's bookings other than the bed, which has its own tile */}
              {data.bookings.filter((b) => b !== lodging).length > 0 && (
                <section className="overflow-hidden rounded-[18px] border border-line bg-white">
                  <header className="bg-paper-deep px-3.5 py-2.5">
                    <h2 className="text-xs font-bold text-ink">
                      {strings.today.bookingsToday}
                    </h2>
                  </header>
                  <ul>
                    {data.bookings
                      .filter((b) => b !== lodging)
                      .map((booking) => (
                        <li
                          key={booking.id}
                          className="flex items-baseline justify-between gap-2 border-t border-line px-3.5 py-2.5"
                        >
                          <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">
                            {booking.title}
                          </span>
                          <span
                            className="shrink-0 text-[10.5px] text-ink-soft"
                            dir="ltr"
                          >
                            {booking.confirmation_code ??
                              (booking.cost != null
                                ? formatMoney(
                                    booking.cost,
                                    booking.currency ?? "ILS"
                                  )
                                : "")}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

              {data.day.notes && (
                <p className="rounded-[18px] bg-sea-tint px-4 py-3 text-sm text-sea-deep">
                  {data.day.notes}
                </p>
              )}

            </div>
          </>
        )}

        {/* Quick action (SPEC 2.1). Outside the conditional on purpose: before
            the trip starts - and on any day with no itinerary row - there is no
            `data.day`, and burying this in the populated branch left the empty
            state with no way to add an expense.

            There was a second button beside it linking to the itinerary. The
            bottom bar already has that tab on every screen, so it was a wider
            copy of a link one tap away, and it cost half the row. */}
        <Link
          href="/budget"
          className="mt-2.5 block rounded-2xl bg-sea py-3 text-center text-sm font-bold text-white active:bg-sea-deep lg:col-span-3 lg:mt-1"
          style={{ boxShadow: "0 10px 22px -14px rgba(14,124,107,.7)" }}
        >
          {strings.today.quickExpense}
        </Link>
      </div>
    </div>
  );
}
