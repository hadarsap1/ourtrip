"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  BellIcon,
  ChecklistIcon,
  PlaneIcon,
  ChevronForwardIcon,
  CoinIcon,
  type IconProps,
  JournalIcon,
  MailIcon,
  MapIcon,
  MemoryBookIcon,
  MessagesIcon,
  OptionsIcon,
  PersonIcon,
  PhotosIcon,
  PhrasebookIcon,
  SparkleIcon,
} from "@/components/icons";
import { InstallPrompt } from "@/components/InstallPrompt";
import { countryName } from "@/lib/data/emergency";
import { loadMoreCounts, type MoreCounts } from "@/lib/data/moreCounts";
import { strings } from "@/lib/strings";

type Tile = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** null while the counts are still loading, so the row doesn't flash a 0. */
  count: number | null;
  tone?: "sea" | "sun";
  badge?: number;
};

type AdminRow = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  state: string | null;
};

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            className="flex h-full flex-col gap-[7px] rounded-[17px] border border-line bg-white px-3.5 py-3 active:bg-paper-deep"
          >
            <span className="relative w-fit">
              <span
                className={`grid h-8 w-8 place-items-center rounded-[10px] ${
                  tile.tone === "sun"
                    ? "bg-sun-tint text-sun-deep"
                    : "bg-sea-tint text-sea-deep"
                }`}
              >
                <tile.Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </span>
              {tile.badge != null && tile.badge > 0 && (
                <span className="absolute -left-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white">
                  {tile.badge > 9 ? "9+" : tile.badge}
                </span>
              )}
            </span>
            <span className="text-[13.5px] font-bold text-ink">
              {tile.label}
              {tile.count !== null && tile.count > 0 && (
                <span className="ms-1 text-[10.5px] font-medium text-ink-faint">
                  · {tile.count}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MoreScreen() {
  const [counts, setCounts] = useState<MoreCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMoreCounts().then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const n = (value: number | undefined) => (counts ? (value ?? 0) : null);

  const explore: Tile[] = [
    {
      href: "/recommend",
      label: strings.more.menuRecommend,
      Icon: SparkleIcon,
      count: n(counts?.recommendations),
      tone: "sun",
    },
    {
      href: "/map",
      label: strings.more.menuMap,
      Icon: MapIcon,
      count: n(counts?.mapPins),
    },
    {
      href: "/phrasebook",
      label: strings.more.menuPhrasebook,
      Icon: PhrasebookIcon,
      count: n(counts?.phrases),
    },
    {
      href: "/options",
      label: strings.more.menuOptions,
      Icon: OptionsIcon,
      count: n(counts?.options),
    },
  ];

  const memories: Tile[] = [
    {
      href: "/journal",
      label: strings.more.menuJournal,
      Icon: JournalIcon,
      count: n(counts?.journal),
    },
    {
      href: "/photos",
      label: strings.more.menuPhotos,
      Icon: PhotosIcon,
      count: n(counts?.photos),
    },
    {
      href: "/memory-book",
      label: strings.more.menuMemoryBook,
      Icon: MemoryBookIcon,
      count: null,
      tone: "sun",
    },
    {
      href: "/messages",
      label: strings.more.menuMessages,
      Icon: MessagesIcon,
      count: n(counts?.messages),
    },
  ];

  // These are settings, not destinations, so they get a list rather than tiles
  // - and each says what state it is in.
  const admin: AdminRow[] = [
    {
      href: "/checklists",
      label: strings.more.menuChecklists,
      Icon: ChecklistIcon,
      state: counts
        ? strings.more.checklistState
            .replace("{done}", String(counts.checklistDone))
            .replace("{total}", String(counts.checklistTotal))
        : null,
    },
    {
      href: "/pocket",
      label: strings.more.menuPocket,
      Icon: CoinIcon,
      state: strings.more.pocketState,
    },
    {
      href: "/kids",
      label: strings.more.menuKids,
      Icon: PersonIcon,
      state: counts
        ? strings.more.devicesState.replace("{n}", String(counts.kidDevices))
        : null,
    },
    {
      href: "/guests",
      label: strings.more.menuGuests,
      Icon: MailIcon,
      state: counts
        ? strings.more.guestsState.replace("{n}", String(counts.guests))
        : null,
    },
    {
      href: "/notifications",
      label: strings.more.menuNotifications,
      Icon: BellIcon,
      state: strings.more.notificationsState,
    },
    {
      href: "/ready",
      label: strings.ready.menu,
      Icon: PlaneIcon,
      state: null,
    },
  ];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-4 px-4 pt-6 pb-4 sm:max-w-2xl lg:max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-ink">{strings.nav.more}</h1>

      {/* Renders only while the app is not installed yet, so it disappears for
          good once it is on the home screen. */}
      <InstallPrompt />

      <section>
        <p className="ot-kicker mb-2 px-0.5">{strings.more.groupExplore}</p>
        <TileGrid tiles={explore} />
      </section>

      <section>
        <p className="ot-kicker mb-2 px-0.5">{strings.more.groupMemories}</p>
        <TileGrid tiles={memories} />
      </section>

      <section>
        <p className="ot-kicker mb-2 px-0.5">{strings.more.groupFamily}</p>
        <ul className="overflow-hidden rounded-[18px] border border-line bg-white">
          {admin.map((row, i) => (
            <li key={row.href} className={i > 0 ? "border-t border-line" : ""}>
              <Link
                href={row.href}
                className="flex items-center gap-3 px-3.5 py-3 active:bg-paper-deep"
              >
                <row.Icon
                  className="h-[18px] w-[18px] shrink-0 text-sea"
                  strokeWidth={1.7}
                />
                <span className="flex-1 text-[13.5px] font-medium text-ink">
                  {row.label}
                </span>
                {row.state && (
                  <span className="shrink-0 text-[11px] text-ink-soft">
                    {row.state}
                  </span>
                )}
                <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Emergency stays visually separate and unmistakable. Naming the country
          you'd land on is the difference between a link and an answer - and it
          comes from today's itinerary day, never a configured destination. */}
      <Link
        href="/emergency"
        className="mt-auto flex items-center gap-2.5 rounded-[18px] border border-alert/20 bg-alert-tint px-3.5 py-3 text-alert"
      >
        <span
          className="shrink-0 rounded-md border-[1.4px] border-alert/35 px-[5px] py-0.5 text-[10px] font-extrabold tracking-[0.06em]"
          aria-hidden="true"
        >
          {strings.emergency.sos}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {strings.more.menuEmergency}
            {counts?.countryCode && ` · ${countryName(counts.countryCode)}`}
          </span>
          <span className="block text-[10.5px] text-alert/80">
            {strings.more.emergencyMeta}
          </span>
        </span>
        <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-alert/45" />
      </Link>
    </div>
  );
}
