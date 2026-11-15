"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KidFactCard } from "@/components/facts/KidFactCard";
import {
  BulbIcon,
  CoinIcon,
  JarIcon,
  MessagesIcon,
  MicIcon,
  PhotosIcon,
  PhrasebookIcon,
  PinIcon,
  RouteIcon,
  WeatherIcon,
} from "@/components/icons";
import { KidIsraelClock } from "@/components/today/FamilyClock";
import { countryTone } from "@/lib/countryColor";
import { flagEmoji } from "@/lib/data/countryProfile";
import { countryName } from "@/lib/data/emergency";
import { listDays } from "@/lib/data/itinerary";
import { daysUntil } from "@/lib/data/readiness";
import type { TodayData } from "@/lib/data/today";
import type { DayWeather } from "@/lib/data/weather";
import { FLAG_DEFAULTS, isEnabled } from "@/lib/flags";
import { formatTime, todayISO } from "@/lib/format";
import { readQuery, writeQuery } from "@/lib/offline/queryCache";
import { strings } from "@/lib/strings";
import { passportStamps, stampTilt, type Stamp } from "@/lib/tripStats";
import type { ItineraryItem, Member } from "@/lib/types";

/** The stamps, from the itinerary a kid may read; the last list is kept on
 *  the tablet so the passport is there in the car too. */
function useStamps(tripId: string | null): Stamp[] {
  const [stamps, setStamps] = useState<Stamp[]>([]);
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const key = `kid-passport:${tripId}`;
    type Row = { date: string; country_code: string | null };
    void (async () => {
      let rows: Row[] | null = null;
      try {
        rows = (await listDays(tripId)).map((d) => ({ date: d.date, country_code: d.country_code }));
        void writeQuery(key, rows);
      } catch {
        rows = (await readQuery<Row[]>(key))?.data ?? null;
      }
      if (alive && rows) setStamps(passportStamps(rows, todayISO()));
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);
  return stamps;
}

/**
 * The kids' own home (Hadar 15/11/2026): the same boxes as the parents' with
 * a bigger title gave a kid nothing to look forward to. Now: a passport that
 * fills up country by country, the place in its country's colour, and four
 * tiles in colour. No day plan by the hour (Hadar 15/11/2026): the kids only
 * need to know what was BOOKED for today - a tour, a show, a class - so only
 * items tied to a booking are listed, and with none there is no list at all.
 *
 * Read-only, as before: a kid's policies are select-only on the itinerary,
 * and nothing here reaches the budget, the vault or the bookings.
 */
export function KidHome({
  member,
  tripId,
  data,
  weather,
  clock,
  unreadWall,
  albumFresh,
}: {
  member: Member;
  tripId: string | null;
  data: TodayData | null;
  weather: DayWeather | null;
  clock: Date;
  unreadWall: number;
  albumFresh: number;
}) {
  const k = strings.kidHome;
  const stamps = useStamps(tripId);
  const items: ItineraryItem[] = data?.items.filter((i) => i.status !== "cancelled") ?? [];
  const country = data?.day?.country_code ?? null;
  const tone = countryTone(country);

  // only what was booked for today; the booking itself (price, code) is the
  // parents' and is never read here - the item just says it has one
  const booked = items.filter((i) => i.booking_id !== null && i.status !== "done");

  const earned = stamps.filter((s) => s.earned).length;
  const upcoming = stamps.find((s) => !s.earned) ?? null;
  const daysToNext = upcoming ? daysUntil(todayISO(), upcoming.firstDate) : null;
  const passportHref = isEnabled("statsStamps") ? "/stats" : "/itinerary";

  const big: { href: string; Icon: typeof RouteIcon; label: string; badge?: number; bg: string }[] = [
    { href: "/messages", Icon: MessagesIcon, label: k.tileWall, badge: unreadWall, bg: "bg-cat-transport" },
    { href: "/photos", Icon: PhotosIcon, label: k.tilePhotos, badge: albumFresh, bg: "bg-cat-activity" },
    { href: "/podcast", Icon: MicIcon, label: k.tilePodcast, bg: "bg-cat-shop" },
    { href: "/facts", Icon: BulbIcon, label: k.tileFacts, bg: "bg-cat-ins" },
  ];
  const small: { href: string; Icon: typeof RouteIcon; label: string }[] = [
    { href: "/itinerary", Icon: RouteIcon, label: k.tileRoute },
    { href: "/jar", Icon: JarIcon, label: strings.jar.navLabel },
    { href: "/phrasebook", Icon: PhrasebookIcon, label: k.tilePhrasebook },
    ...(FLAG_DEFAULTS.pocketMoney ? [{ href: "/pocket", Icon: CoinIcon, label: k.tilePocket }] : []),
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-5 pb-8 sm:max-w-2xl">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl font-extrabold"
            style={{ background: tone.bg, color: tone.on }}
          >
            {member.display_name.trim().charAt(0)}
          </span>
          <h1 className="min-w-0 truncate text-3xl font-bold">
            {k.hello} {member.display_name}!
          </h1>
        </div>
        <Link
          href="/emergency"
          aria-label={strings.emergency.title}
          className="shrink-0 rounded-2xl bg-alert px-3 py-2 text-sm font-bold text-on-alert"
        >
          {strings.emergency.sos}
        </Link>
      </header>

      {/* where we are, in the country's own colour */}
      <section className="rounded-card p-4" style={{ background: tone.bg, color: tone.on }}>
        <p className="text-sm font-medium opacity-85">{k.whereToday}</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
          {country ? (
            <span aria-hidden="true">{flagEmoji(country)}</span>
          ) : (
            <PinIcon className="h-6 w-6 shrink-0 opacity-80" />
          )}
          {data?.day?.location_name ?? k.noLocation}
        </p>
        {weather && (
          <p className="mt-1.5 flex items-center gap-2 text-lg">
            <WeatherIcon code={weather.weatherCode} className="h-6 w-6 opacity-90" />
            <span dir="ltr">
              {weather.tempMin}-{weather.tempMax}°
            </span>
          </p>
        )}
        <KidIsraelClock now={clock} />
      </section>

      {stamps.length > 0 && (
        <Link
          href={passportHref}
          aria-label={k.passportOpen}
          className="block rounded-card border border-line bg-paper-deep p-4 active:opacity-90"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-lg font-bold text-ink">{k.passport}</p>
            <p className="text-sm font-semibold text-ink-soft">
              {k.passportCount.replace("{n}", String(earned)).replace("{total}", String(stamps.length))}
            </p>
          </div>
          <ul className="-mx-1 mt-3 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {stamps.map((st) => {
              const t = countryTone(st.code);
              const isNext = st.code === upcoming?.code;
              const label = (st.earned ? k.stampGot : isNext ? k.stampNext : k.stampLater).replace(
                "{country}",
                countryName(st.code)
              );
              return (
                <li key={st.code} className="shrink-0">
                  <span
                    role="img"
                    aria-label={label}
                    className={`grid h-14 w-14 place-items-center rounded-full border-[3px] text-2xl ${
                      st.earned ? "" : isNext ? "border-dashed" : "border-dashed opacity-40 grayscale"
                    }`}
                    style={{
                      borderColor: t.bg,
                      background: st.earned ? t.soft : undefined,
                      transform: st.earned ? `rotate(${stampTilt(st.code)}deg)` : undefined,
                    }}
                  >
                    <span aria-hidden="true">{flagEmoji(st.code)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm font-semibold text-ink-soft">
            {!upcoming || daysToNext === null
              ? k.passportDone
              : daysToNext <= 1
                ? k.passportNextTomorrow.replace("{country}", countryName(upcoming.code))
                : k.passportNext.replace("{n}", String(daysToNext)).replace("{country}", countryName(upcoming.code))}
          </p>
        </Link>
      )}

      {booked.length > 0 && (
        <section className="rounded-card bg-surface p-4 shadow-card">
          <p className="text-sm font-bold" style={{ color: tone.bg }}>
            {k.bookedToday}
          </p>
          <ul className="mt-1 space-y-2">
            {booked.map((item) => (
              <li key={item.id}>
                <p className="text-xl font-bold leading-snug text-ink">{item.title}</p>
                {(item.start_time || item.location_name) && (
                  <p className="text-base text-ink-soft">
                    {item.start_time && <bdi className="font-bold tabular-nums">{formatTime(item.start_time)}</bdi>}
                    {item.start_time && item.location_name && " · "}
                    {item.location_name}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        {big.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`relative flex min-h-[104px] flex-col justify-between rounded-card p-4 text-on-cat active:opacity-90 ${tile.bg}`}
          >
            <tile.Icon className="h-8 w-8" />
            <span className="text-lg font-bold leading-6">{tile.label}</span>
            {tile.badge ? (
              <span className="absolute end-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-full bg-surface px-1.5 text-sm font-extrabold text-ink">
                {tile.badge > 9 ? "9+" : tile.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      {/* One fact about where they are, or nothing when there is none yet. */}
      {tripId && <KidFactCard tripId={tripId} />}

      <Link href="/stories" className="block rounded-card bg-sun-tint p-4 text-sun-deep">
        <p className="text-lg font-bold">{k.journalPrompt}</p>
        <p className="mt-0.5 text-sm font-bold">{k.journalCta} ←</p>
      </Link>

      <section className="space-y-2">
        <p className="ot-kicker px-0.5">{k.moreTitle}</p>
        <div className="flex flex-wrap gap-2">
          {small.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink active:bg-sea-tint/50"
            >
              <tile.Icon className="h-5 w-5 text-sea" />
              {tile.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
