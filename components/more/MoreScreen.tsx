"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { FLAG_DEFAULTS, isEnabled } from "@/lib/flags";
import {
  BellIcon,
  BulbIcon,
  DocumentIcon,
  ChecklistIcon,
  PlaneIcon,
  ChevronForwardIcon,
  SettingsIcon,
  CoinIcon,
  type IconProps,
  JournalIcon,
  MailIcon,
  FlaskIcon,
  GlobeIcon,
  JarIcon,
  MapIcon,
  MessagesIcon,
  MicIcon,
  OptionsIcon,
  PersonIcon,
  PhrasebookIcon,
  SparkleIcon,
  VisaIcon,
} from "@/components/icons";
import { countryName } from "@/lib/data/emergency";
import { loadMoreCounts, type MoreCounts } from "@/lib/data/moreCounts";
import { useMember } from "@/lib/useMember";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { useUnreadWall } from "@/lib/useUnreadWall";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { strings } from "@/lib/strings";
import { PageHeader } from "@/components/ui/PageHeader";

type Tile = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** null while the counts are still loading, so the row doesn't flash a 0. */
  count: number | null;
  tone?: "sea" | "sun";
  badge?: number;
  /** A new like or comment from someone else (00081): a dot, unless the
   *  number badge is already there. */
  dot?: boolean;
  /** a planning row's state ("3 מכשירים"), shown in place of the count */
  state?: string | null;
};

type AdminRow = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  state: string | null;
  /** Waiting for a parent: shown in place of the state, in red. */
  badge?: number;
};

/** The redesign's tiles (קרם חם, P2): a white card, a 40px green-soft icon
 *  circle and a 17px / 800 label, with the count or state under it. */
function TileGrid({ tiles, cols = 2 }: { tiles: Tile[]; cols?: 2 | 3 }) {
  return (
    <ul className={`grid gap-2.5 ${cols === 3 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            className="flex h-full min-h-[96px] flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5 shadow-card active:bg-paper-deep"
          >
            <span className="relative w-fit">
              <span
                className={`grid h-10 w-10 place-items-center rounded-full ${
                  tile.tone === "sun" ? "bg-sun-tint text-sun-deep" : "bg-green-soft text-green"
                }`}
              >
                <tile.Icon className="h-[22px] w-[22px]" strokeWidth={2} />
              </span>
              {tile.badge != null && tile.badge > 0 && (
                <span className="absolute -end-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral px-1 text-xs font-extrabold text-on-coral ring-2 ring-surface">
                  {tile.badge > 9 ? "9+" : tile.badge}
                </span>
              )}
              {tile.dot && !(tile.badge != null && tile.badge > 0) && (
                <span
                  className="absolute -end-0.5 -top-0.5 h-[11px] w-[11px] rounded-full bg-coral ring-2 ring-surface"
                  role="status"
                  aria-label={strings.more.newFeedback}
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[17px] font-extrabold leading-tight text-ink">{tile.label}</span>
              {tile.state ? (
                <span className="mt-0.5 block text-[13px] font-medium text-muted">{tile.state}</span>
              ) : (
                tile.count !== null &&
                tile.count > 0 && (
                  <span className="mt-0.5 block text-[13px] font-medium tabular-nums text-muted">{tile.count}</span>
                )
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const noopSubscribe = () => () => {};

export function MoreScreen() {
  const statsOn = useSyncExternalStore(noopSubscribe, () => isEnabled("statsStamps"), () => false);
  const [counts, setCounts] = useState<MoreCounts | null>(null);
  const { member } = useMember();
  // what waits for approval - a parent's queue only (join requests are owner-only)
  const pending = usePendingApprovals(member?.role === "owner" ? member.trip_id : null);
  // new chat messages from the kids, the guests or the other parent
  const unreadWall = useUnreadWall();
  // new likes and comments from others on updates, photos and episodes
  const fresh = useNewFeedback(member?.role === "owner" ? member.trip_id : null);

  useEffect(() => {
    let cancelled = false;
    void loadMoreCounts().then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A kid gets here from the settings screen's back arrow. The vault and the
  // planning rows are the parents' (RoleGate turns a kid away from each), so
  // they are not offered (QA 15/11/2026). Cosmetic: RLS is the boundary.
  const isKid = member?.role === "kid";

  const n = (value: number | undefined) => (counts ? (value ?? 0) : null);

  // Grouped by when you reach for them (UX pass 06/11/2026): "בדרך" is what
  // you need out on the street, the memories are what you share. Photos left
  // this screen for the bottom bar; the documents vault took their place here.
  const onTheRoad: Tile[] = [
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
      href: "/documents",
      // No counter: moreCounts does not read the vault, and kids and guests
      // are refused it by RLS anyway - this screen is a parent's.
      label: strings.nav.documents,
      Icon: DocumentIcon,
      count: null,
    },
  ];

  // The updates (00078), the chat and the podcast; the memory book opens from
  // the updates. The facts and the numbers are the trip told back to you.
  const memories: Tile[] = [
    {
      href: "/stories",
      label: strings.more.menuJournal,
      Icon: JournalIcon,
      count: n(counts?.stories),
      badge: pending?.stories,
      dot: fresh.stories > 0,
    },
    {
      href: "/messages",
      label: strings.more.menuMessages,
      Icon: MessagesIcon,
      count: n(counts?.messages),
      badge: unreadWall,
    },
    {
      href: "/podcast",
      label: strings.more.menuPodcast,
      Icon: MicIcon,
      count: n(counts?.episodes),
      badge: pending?.episodes,
      dot: fresh.episodes > 0,
    },
    {
      href: "/facts",
      // No counter: moreCounts does not tally destination_facts, and a tile
      // showing 0 would read as "broken" rather than "none written yet".
      label: strings.facts.navLabel,
      Icon: BulbIcon,
      count: null,
    },
    {
      href: "/jar",
      label: strings.jar.navLabel,
      Icon: JarIcon,
      count: null,
    },
    ...(statsOn
      ? [{ href: "/stats", label: strings.more.menuStats, Icon: GlobeIcon, count: null } satisfies Tile]
      : []),
  ];

  // These are settings, not destinations, so they get a list rather than tiles
  // - and each says what state it is in.
  const admin: AdminRow[] = [
    {
      href: "/options",
      label: strings.more.menuOptions,
      Icon: OptionsIcon,
      state: counts ? strings.more.optionsState.replace("{n}", String(counts.options)) : null,
    },
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
    ...(FLAG_DEFAULTS.pocketMoney
      ? [{ href: "/pocket", label: strings.more.menuPocket, Icon: CoinIcon, state: strings.more.pocketState }]
      : []),
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
      badge: pending?.guestRequests,
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
    {
      href: "/visas",
      label: strings.more.menuVisas,
      Icon: VisaIcon,
      state: strings.more.visasState,
    },
  ];

  // the planning rows as tiles too (P2: "the same tile style")
  const adminTiles: Tile[] = admin.map((row) => ({
    href: row.href,
    label: row.label,
    Icon: row.Icon,
    count: null,
    badge: row.badge,
    state: row.badge ? strings.approvals.waiting.replace("{n}", String(row.badge)) : row.state,
  }));

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-5 px-[18px] pt-[26px] pb-4 sm:max-w-2xl lg:max-w-4xl">
      <PageHeader
        title={strings.nav.more}
        end={
          // Theme, steps, backup live in Settings - More stays a menu.
          <Link
            href="/settings"
            aria-label={strings.settings.title}
            className="-me-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-paper-deep"
          >
            <SettingsIcon className="h-6 w-6" />
          </Link>
        }
      />

      <section>
        <h2 className="mb-2.5 px-0.5 text-base font-extrabold text-muted">{strings.more.groupOnTheRoad}</h2>
        <TileGrid tiles={isKid ? onTheRoad.filter((t) => t.href !== "/documents") : onTheRoad} />
      </section>

      <section>
        <h2 className="mb-2.5 px-0.5 text-base font-extrabold text-muted">{strings.more.groupMemories}</h2>
        <TileGrid tiles={memories} cols={3} />
      </section>

      {!isKid && (
        <section>
          <h2 className="mb-2.5 px-0.5 text-base font-extrabold text-muted">{strings.more.groupFamily}</h2>
          <TileGrid tiles={adminTiles} />
        </section>
      )}

      {/* the guest preview starts in Settings, where its groups are chosen */}
      {member?.role === "owner" && (
        <Link
          href="/settings#preview"
          className="flex min-h-14 items-center gap-3 rounded-[20px] border border-line bg-surface px-3.5 py-2.5 shadow-card active:bg-paper-deep"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-soft text-green">
            <FlaskIcon className="h-[22px] w-[22px]" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 text-[15px] text-muted">{strings.more.previewHint}</span>
          <span className="shrink-0 rounded-full bg-green-soft px-3.5 py-1.5 text-[15px] font-bold text-green">
            {strings.more.previewCta}
          </span>
        </Link>
      )}

      {/* Emergency stays visually separate and unmistakable. Naming the country
          you'd land on is the difference between a link and an answer - and it
          comes from today's itinerary day, never a configured destination. */}
      <Link
        href="/emergency"
        className="mt-auto flex min-h-16 items-center gap-3 rounded-[20px] border border-coral bg-coral-soft px-3.5 py-3 text-coral-ink"
      >
        <span
          className="shrink-0 rounded-lg bg-coral px-2 py-1 text-sm font-extrabold tracking-[0.04em] text-on-coral"
          aria-hidden="true"
        >
          {strings.emergency.sos}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-extrabold">
            {strings.more.menuEmergency}
            {counts?.countryCode && ` · ${countryName(counts.countryCode)}`}
          </span>
          <span className="block text-[13px] font-medium">{strings.more.emergencyMeta}</span>
        </span>
        <ChevronForwardIcon className="h-4 w-4 shrink-0" />
      </Link>
    </div>
  );
}
