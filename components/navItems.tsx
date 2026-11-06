import type { ComponentType } from "react";
import {
  BellIcon,
  BulbIcon,
  BudgetIcon,
  ChecklistIcon,
  CoinIcon,
  DocumentIcon,
  HomeIcon,
  type IconProps,
  JournalIcon,
  MailIcon,
  MapIcon,
  MessagesIcon,
  MicIcon,
  MoreIcon,
  OptionsIcon,
  PersonIcon,
  PhotosIcon,
  PhrasebookIcon,
  PlaneIcon,
  RouteIcon,
  SparkleIcon,
  VisaIcon,
  SettingsIcon,
} from "@/components/icons";
import { FLAG_DEFAULTS } from "@/lib/flags";
import { strings } from "@/lib/strings";

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
};

// Kid tablet variant: kid-relevant destinations only (cosmetic - kids are
// locked out of owner data by RLS regardless). Phrasebook and the podcast stay
// reachable from the kid home tiles. Pocket money is behind a flag (off).
export const kidTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/itinerary", label: strings.kidNav.route, Icon: RouteIcon },
  { href: "/messages", label: strings.kidNav.messages, Icon: MessagesIcon },
  { href: "/photos", label: strings.kidNav.photos, Icon: PhotosIcon },
  { href: "/stories", label: strings.kidNav.journal, Icon: JournalIcon },
  { href: "/facts", label: strings.facts.navLabel, Icon: BulbIcon },
  ...(FLAG_DEFAULTS.pocketMoney ? [{ href: "/pocket", label: strings.kidNav.pocket, Icon: CoinIcon }] : []),
];

// Guest portal ("סו-בב עולם!"): the updates (what the family shared) and the
// podcast lead; the map of where we've been sits at the top of the updates.
// Photos are a place of their own again, by place (Hadar 01/11/2026).
export const guestTabs: NavItem[] = [
  { href: "/", label: strings.guestNav.home, Icon: HomeIcon },
  { href: "/stories", label: strings.guestNav.stories, Icon: JournalIcon },
  { href: "/podcast", label: strings.guestNav.podcast, Icon: MicIcon },
  { href: "/photos", label: strings.guestNav.photos, Icon: PhotosIcon },
  { href: "/messages", label: strings.guestNav.messages, Icon: MessagesIcon },
];

export const ownerTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/itinerary", label: strings.nav.itinerary, Icon: RouteIcon },
  { href: "/budget", label: strings.nav.budget, Icon: BudgetIcon },
  // Photos replaced documents on the bar (UX pass 06/11/2026): on the road the
  // photos are opened and approved every day, the vault a few times a trip. The
  // vault is one tap away on "עוד" and still works offline.
  { href: "/photos", label: strings.nav.photos, Icon: PhotosIcon },
  { href: "/more", label: strings.nav.more, Icon: MoreIcon },
];

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Everything that lives behind "עוד" on mobile, for the desktop rail.
 *
 * The rail replaces the bottom bar from lg up and drops the "עוד" tab, so
 * whatever is not listed here has no way in on a desktop at all. It used to
 * carry four memory destinations, which left TEN screens reachable only by
 * typing the URL - the options bank, recommendations, the phrasebook, the
 * memory book, checklists, pocket money, kids, guests, notifications and
 * readiness. Reported from the desktop 2026-09-06.
 *
 * Grouped and ordered exactly like MoreScreen, so the two navigations teach
 * the same map rather than two different ones.
 */
export const ownerRailGroups: NavGroup[] = [
  {
    label: strings.more.groupOnTheRoad,
    items: [
      { href: "/recommend", label: strings.more.menuRecommend, Icon: SparkleIcon },
      { href: "/map", label: strings.more.menuMap, Icon: MapIcon },
      { href: "/phrasebook", label: strings.more.menuPhrasebook, Icon: PhrasebookIcon },
      { href: "/documents", label: strings.nav.documents, Icon: DocumentIcon },
    ],
  },
  {
    label: strings.more.groupMemories,
    items: [
      { href: "/stories", label: strings.more.menuJournal, Icon: JournalIcon },
      { href: "/messages", label: strings.more.menuMessages, Icon: MessagesIcon },
      { href: "/podcast", label: strings.more.menuPodcast, Icon: MicIcon },
      // Owner-facing too: FactsScreen is where the AI facts are generated,
      // checked and deleted before the kids read them.
      { href: "/facts", label: strings.facts.navLabel, Icon: BulbIcon },
    ],
  },
  {
    label: strings.more.groupFamily,
    items: [
      { href: "/options", label: strings.more.menuOptions, Icon: OptionsIcon },
      { href: "/checklists", label: strings.more.menuChecklists, Icon: ChecklistIcon },
      ...(FLAG_DEFAULTS.pocketMoney ? [{ href: "/pocket", label: strings.more.menuPocket, Icon: CoinIcon }] : []),
      { href: "/kids", label: strings.more.menuKids, Icon: PersonIcon },
      { href: "/guests", label: strings.more.menuGuests, Icon: MailIcon },
      { href: "/notifications", label: strings.more.menuNotifications, Icon: BellIcon },
      { href: "/ready", label: strings.ready.menu, Icon: PlaneIcon },
      { href: "/visas", label: strings.more.menuVisas, Icon: VisaIcon },
      { href: "/settings", label: strings.settings.title, Icon: SettingsIcon },
    ],
  },
];

export function tabsForRole(role: string): NavItem[] {
  if (role === "kid") return kidTabs;
  if (role === "guest") return guestTabs;
  return ownerTabs;
}

export function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
