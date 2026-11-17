"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountdownHome } from "./CountdownHome";
import { PendingApprovalsCard } from "./PendingApprovalsCard";
import { InTripNow } from "./InTripNow";
import { StepsCard } from "./StepsCard";
import { IosInstallHint } from "./IosInstallHint";
import { Banner } from "@/components/ui/Banner";
import { albumNewsTotal, useAlbumNews } from "@/components/photos/AlbumNews";
import { isEnabled } from "@/lib/flags";
import { GuestHome } from "@/components/today/GuestHome";
import { KidHome } from "@/components/today/KidHome";
import {
  BedIcon,
  CameraIcon,
  PinIcon,
  RainDropIcon,
  RouteIcon,
  WeatherIcon,
} from "@/components/icons";
import { countryName } from "@/lib/data/emergency";
import { loadToday, type TodayData } from "@/lib/data/today";
import {
  loadTodayDashboard,
  type TodayDashboard,
} from "@/lib/data/todayDashboard";
import { getTodayMapSnapshotUrl, navigationUrl } from "@/lib/data/map";
import {
  describeWeather,
  getDayWeather,
  type DayWeather,
} from "@/lib/data/weather";
import { formatDate, formatMoney, formatTime, formatWeekday, todayISO } from "@/lib/format";
import { daysUntil } from "@/lib/data/readiness";
import { getActiveTrip, getNowCountry } from "@/lib/data/trip";
import { strings } from "@/lib/strings";
import { ScreenSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { minutesNow } from "@/lib/tripDay";
import { bookedToday } from "@/lib/bookedToday";
import { useMember } from "@/lib/useMember";
import { useUnreadWall } from "@/lib/useUnreadWall";
import type { Booking, Trip } from "@/lib/types";

/** 17:00 local: from here, with nothing left on the plan, the home is "evening". */
const EVENING_FROM_MINUTES = 17 * 60;

/** Tonight's bed: the lodging booking covering today, if there is one. */
function tonightsLodging(bookings: Booking[]): Booking | null {
  return bookings.find((b) => b.type === "hotel") ?? null;
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
      // lifted off the paper instead of outlined: cream on parchment with a
      // hairline made every card melt into the background (UI pass 15/11/2026)
      className={`rounded-card px-3.5 py-3 shadow-card ${tone === "sun" ? "bg-sun-tint" : "bg-surface"}`}
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.09em] ${
          tone === "sun" ? "text-sun-deep" : "text-ink-soft"
        }`}
      >
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

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
  // the kids' wall tile shows new messages
  const unreadWall = useUnreadWall();
  // Re-derives "next up" and the current agenda row as the day moves on.
  const [now, setNow] = useState(() => minutesNow());
  const [clock, setClock] = useState(() => new Date());
  // guests: the country the family is in today (00069), for their clock
  const [nowCountry, setNowCountry] = useState<string | null>(null);

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
    const tick = setInterval(() => {
      const d = new Date();
      setNow(minutesNow(d));
      setClock(d);
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const { member, memberLoading } = useMember();
  const isGuest = member?.role === "guest";

  // Budget and photo tiles are the parents' home only. A guest's and a kid's
  // home asked for them too - seven requests their policies answer with
  // nothing (QA 15/11/2026). An enhancement: null when offline, and the rest
  // of the home renders regardless.
  const dashboardFor = memberLoading ? null : (member?.role ?? "owner");
  useEffect(() => {
    if (dashboardFor !== "owner") return;
    let cancelled = false;
    void loadTodayDashboard().then((d) => {
      if (!cancelled) setDashboard(d);
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardFor]);
  const tripId = trip?.id ?? null;

  // The country changes at most once a day; a quarter-hour re-ask catches the
  // border day without a request per minute.
  useEffect(() => {
    if (!isGuest || !tripId) return;
    let alive = true;
    const ask = () =>
      void getNowCountry(tripId).then((code) => {
        if (alive) setNowCountry(code);
      });
    ask();
    const every = setInterval(ask, 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(every);
    };
  }, [isGuest, tripId]);

  // "new in the album" (00087): a line on the guest home, a badge on the
  // photos door for guests and kids
  const albumNews = useAlbumNews(tripId, member?.id ?? null, isGuest || member?.role === "kid");
  const albumFresh = albumNewsTotal(albumNews);

  const data = result?.data ?? null;
  const activeItems = data?.items.filter((i) => i.status !== "cancelled") ?? [];

  // ---------- guest portal home: a note from the road (GuestHome) ----------
  if (member?.role === "guest") {
    return (
      <GuestHome
        member={member}
        tripId={tripId}
        now={clock}
        countryCode={nowCountry}
        albumFresh={albumFresh}
        unreadWall={unreadWall}
      />
    );
  }

  // ---------- kid home (SPEC 2.1): passport, what was booked today, colour (KidHome) ----------
  if (member?.role === "kid") {
    return (
      <KidHome
        member={member}
        tripId={tripId}
        data={data}
        weather={weather}
        clock={clock}
        unreadWall={unreadWall}
        albumFresh={albumFresh}
      />
    );
  }

  /* ---------- owner, before departure: the countdown ----------
     Until 03.11.2026 the itinerary has no day for "today", so the dashboard
     below renders an empty card - which is what every open of the app has
     shown for weeks. Between now and then the useful home screen is what still
     has to happen before the flight. Switches over on its own on the day the
     trip starts; no setting to forget. */
  // Below is the parents' home. While the member is still being looked up it
  // is not yet known to be a parent's - a guest's first open after approval
  // briefly had no member and showed the parents' budget card (QA 17/10).
  if (!tripChecked || (!member && memberLoading)) {
    return (
      <ScreenSkeleton variant="today" />
    );
  }

  const startsIn = trip ? daysUntil(todayISO(), trip.start_date) : null;
  if (trip && startsIn !== null && startsIn > 0) {
    return <CountdownHome trip={trip} />;
  }

  /* ---------- owner: dashboard (direction 1b) ---------- */

  const position = dashboard?.position ?? null;
  const v2 = isEnabled("todayV2");
  // Once it is evening, what matters is
  // tonight's bed, what the day cost and its photos - so on a phone those come
  // first and the finished agenda drops below (UX pass 06/11/2026). The desktop
  // grid keeps its three columns.
  const evening = now >= EVENING_FROM_MINUTES;
  const lodging = data ? tonightsLodging(data.bookings) : null;
  // No day plan by the hour on the home (Hadar 15/11/2026, as on the kids'
  // home): only what was BOOKED for today. The full plan is on the itinerary
  // screen, which works offline. A booking with an item on today's plan shows
  // that item's time and place; one without is listed by its own title.
  const booked = bookedToday(activeItems, data?.bookings ?? [], lodging);
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
      <header className="ot-band px-6 pb-3.5 pt-4">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3 sm:max-w-2xl lg:max-w-none">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-lg font-extrabold leading-tight">
              <PinIcon className="h-[17px] w-[17px] shrink-0 text-white/80" />
              <span className="truncate">
                {data?.day?.location_name ?? strings.today.noPlace}
                {data?.day?.country_code ? `, ${countryName(data.day.country_code)}` : ""}
              </span>
            </h1>
            <p className="mt-1 text-xs text-white/75">{dayLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* SOS only (Hadar 06/11/2026): the capture button at the bottom
                already adds an expense in two taps from every screen, so a
                second "+ הוצאה" here was the same action twice. */}
            <Link
              href="/emergency"
              aria-label={strings.emergency.title}
              className="min-h-[44px] rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-extrabold tracking-[0.06em] text-white active:bg-white/20"
            >
              {strings.emergency.sos}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col px-4 pt-3 sm:max-w-2xl lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_282px_282px] lg:items-start lg:gap-4 lg:px-9 lg:pt-6">
        {v2 && (
          <div className="mb-2.5 lg:col-span-3">
            <IosInstallHint />
          </div>
        )}
        {trip && (
          <div className="mb-2.5 empty:hidden lg:col-span-3">
            <PendingApprovalsCard tripId={trip.id} />
          </div>
        )}
        {result?.fromCache && (
          <Banner tone="warning" className="mb-2.5 lg:col-span-3">
            {strings.offline.fromCache}
            {data && ` · ${strings.today.snapshotFrom} ${formatDate(data.date)}`}
          </Banner>
        )}

        {loading ? (
          <div className="space-y-3 pt-4 lg:col-span-3" role="status" aria-busy="true" aria-label={strings.common.loading}>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : !data || !data.day ? (
          <section className="ot-card p-8 text-center lg:col-span-3">
            <RouteIcon className="mx-auto mb-3 h-9 w-9 text-line" />
            <h2 className="mb-2 text-lg font-bold text-ink">
              {strings.today.emptyTitle}
            </h2>
            <p className="text-sm text-ink-soft">
              {data && !data.day ? strings.today.noDay : strings.today.emptyBody}
            </p>
          </section>
        ) : (
          <>
            {/* column 1: what's happening */}
            <div className={`space-y-2.5 lg:space-y-3 ${evening ? "max-lg:order-3 max-lg:mt-2.5" : ""}`}>
              {/* rain alert: >50% chance + outdoor items today (Sprint 5) */}
              {weather &&
                weather.precipitationChance > 50 &&
                activeItems.some((i) => i.is_outdoor) && (
                  <Banner tone="warning" icon={<RainDropIcon className="h-5 w-5" />}>
                    <span className="font-bold">
                      {strings.weather.rainAlert} ({weather.precipitationChance}%)
                    </span>
                  </Banner>
                )}

              <InTripNow now={now} clock={clock} />

              {booked.length > 0 && (
                <section className="rounded-card bg-surface px-3.5 py-3 shadow-card">
                  <h2 className="ot-kicker">{strings.today.bookedToday}</h2>
                  <ul className="mt-1 divide-y divide-line">
                    {booked.map((b) => (
                      <li key={b.key} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p dir="auto" className="truncate text-base font-bold text-ink">
                            {b.title}
                          </p>
                          <p className="truncate text-xs text-ink-soft">
                            {b.time && <bdi className="font-bold tabular-nums text-sea">{formatTime(b.time)}</bdi>}
                            {b.time && (b.place || b.code) && " · "}
                            {b.place}
                            {b.place && b.code && " · "}
                            {b.code && <bdi dir="ltr">{b.code}</bdi>}
                          </p>
                        </div>
                        {b.lat !== null && b.lng !== null && (
                          <a
                            href={navigationUrl(b.lat, b.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center rounded-xl bg-sea px-3.5 text-sm font-bold text-on-sea"
                          >
                            {strings.todayV2.navigate}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {trip && <StepsCard tripId={trip.id} />}
            </div>

            {/* column 2: the four tiles */}
            <div className={`mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:mt-0 lg:grid-cols-1 lg:gap-3 ${evening ? "max-lg:order-1" : ""}`}>
              {weather && (
                <Tile label={strings.today.tileWeather}>
                  <p className="flex items-center gap-2">
                    <WeatherIcon
                      code={weather.weatherCode}
                      className="h-[22px] w-[22px] shrink-0 text-sun-deep"
                    />
                    <span
                      className="text-lg font-extrabold leading-none text-ink"
                      dir="ltr"
                    >
                      {weather.tempMin}-{weather.tempMax}°
                    </span>
                  </p>
                  <p className="mt-1 truncate text-xs text-ink-soft">
                    {describeWeather(weather.weatherCode).label}
                    {weather.precipitationChance > 0 && (
                      <>
                        {" · "}
                        <span dir="ltr">{weather.precipitationChance}%</span>
                      </>
                    )}
                  </p>
                </Tile>
              )}

              <Tile label={strings.today.tileTonight}>
                {lodging ? (
                  <>
                    <p className="flex items-center gap-2">
                      <BedIcon className="h-[21px] w-[21px] shrink-0 text-sea" />
                      <span dir="auto" className="min-w-0 truncate text-sm font-bold text-ink">
                        {lodging.title}
                      </span>
                    </p>
                    {lodging.confirmation_code && (
                      <p
                        className="mt-1 truncate text-xs font-semibold text-ink-soft"
                        dir="ltr"
                      >
                        {lodging.confirmation_code}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">
                    {strings.today.noLodging}
                  </p>
                )}
              </Tile>

              {/* Alone in its row when the weather tile sits beside tonight's
                  lodging, so three tiles do not leave one orphaned half-row. */}
              {dashboard && (
                <div className={weather ? "col-span-2 sm:col-span-1" : ""}>
                  <Tile label={strings.today.tileSpentToday}>
                    <p className="text-lg font-extrabold leading-none text-ink">
                      {formatMoney(Math.round(dashboard.spentToday), "ILS")}
                    </p>
                  </Tile>
                </div>
              )}
            </div>

            {/* column 3: memories and the map */}
            <div className={`mt-2.5 space-y-2.5 empty:hidden lg:mt-0 lg:space-y-3 ${evening ? "max-lg:order-2" : ""}`}>
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
                      className="text-xs font-bold text-sea"
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
                  className="block overflow-hidden rounded-card border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URL snapshot */}
                  <img
                    src={mapUrl}
                    alt={strings.more.menuMap}
                    className="h-40 w-full object-cover"
                  />
                </Link>
              )}

            </div>
          </>
        )}

      </div>
    </div>
  );
}
