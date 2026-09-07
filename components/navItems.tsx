import type { ComponentType } from "react";
import {
  BellIcon,
  BudgetIcon,
  ChecklistIcon,
  CoinIcon,
  DocumentIcon,
  HomeIcon,
  type IconProps,
  JournalIcon,
  MailIcon,
  MapIcon,
  MemoryBookIcon,
  MessagesIcon,
  MoreIcon,
  OptionsIcon,
  PersonIcon,
  PhotosIcon,
  PhrasebookIcon,
  PlaneIcon,
  RouteIcon,
  SparkleIcon,
} from "@/components/icons";
import { strings } from "@/lib/strings";

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
};

// Kid tablet variant: kid-relevant destinations only (cosmetic - kids are
// locked out of owner data by RLS regardless). Phrasebook stays reachable from
// the kid home tile.
export const kidTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/facts", label: strings.facts.navLabel, Icon: SparkleIcon },
  { href: "/journal", label: strings.kidNav.journal, Icon: JournalIcon },
  { href: "/photos", label: strings.kidNav.photos, Icon: PhotosIcon },
  { href: "/messages", label: strings.kidNav.messages, Icon: MessagesIcon },
  { href: "/pocket", label: strings.kidNav.pocket, Icon: CoinIcon },
];

// Guest portal: only shared content + the family wall.
export const guestTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/photos", label: strings.guestNav.photos, Icon: PhotosIcon },
  { href: "/journal", label: strings.guestNav.journal, Icon: JournalIcon },
  { href: "/map", label: strings.guestNav.map, Icon: MapIcon },
  { href: "/messages", label: strings.guestNav.messages, Icon: MessagesIcon },
];

export const ownerTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
  { href: "/itinerary", label: strings.nav.itinerary, Icon: RouteIcon },
  { href: "/budget", label: strings.nav.budget, Icon: BudgetIcon },
  { href: "/documents", label: strings.nav.documents, Icon: DocumentIcon },
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
    label: strings.more.groupExplore,
    items: [
      { href: "/recommend", label: strings.more.menuRecommend, Icon: SparkleIcon },
      { href: "/map", label: strings.more.menuMap, Icon: MapIcon },
      { href: "/phrasebook", label: strings.more.menuPhrasebook, Icon: PhrasebookIcon },
      { href: "/options", label: strings.more.menuOptions, Icon: OptionsIcon },
      // Owner-facing too: FactsScreen is where the AI facts are generated,
      // checked and deleted before the kids read them, and it had no entry
      // point for an owner on either layout - only the kid home tiles.
      { href: "/facts", label: strings.facts.navLabel, Icon: SparkleIcon },
    ],
  },
  {
    label: strings.more.groupMemories,
    items: [
      { href: "/journal", label: strings.more.menuJournal, Icon: JournalIcon },
      { href: "/photos", label: strings.more.menuPhotos, Icon: PhotosIcon },
      { href: "/memory-book", label: strings.more.menuMemoryBook, Icon: MemoryBookIcon },
      { href: "/messages", label: strings.more.menuMessages, Icon: MessagesIcon },
    ],
  },
  {
    label: strings.more.groupFamily,
    items: [
      { href: "/checklists", label: strings.more.menuChecklists, Icon: ChecklistIcon },
      { href: "/pocket", label: strings.more.menuPocket, Icon: CoinIcon },
      { href: "/kids", label: strings.more.menuKids, Icon: PersonIcon },
      { href: "/guests", label: strings.more.menuGuests, Icon: MailIcon },
      { href: "/notifications", label: strings.more.menuNotifications, Icon: BellIcon },
      { href: "/ready", label: strings.ready.menu, Icon: PlaneIcon },
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
