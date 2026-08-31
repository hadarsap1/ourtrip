import type { ComponentType } from "react";
import {
  BudgetIcon,
  CoinIcon,
  DocumentIcon,
  HomeIcon,
  type IconProps,
  JournalIcon,
  MapIcon,
  MessagesIcon,
  MoreIcon,
  PhotosIcon,
  RouteIcon,
} from "@/components/icons";
import { strings } from "@/lib/strings";

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
};

// Kid tablet variant: kid-relevant destinations only (cosmetic — kids are
// locked out of owner data by RLS regardless). Phrasebook stays reachable from
// the kid home tile.
export const kidTabs: NavItem[] = [
  { href: "/", label: strings.nav.today, Icon: HomeIcon },
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

// The desktop rail has the room the bottom bar doesn't, so the four memory
// destinations that live behind "עוד" on mobile get their own group there.
export const ownerRailMemories: NavItem[] = [
  { href: "/journal", label: strings.more.menuJournal, Icon: JournalIcon },
  { href: "/photos", label: strings.more.menuPhotos, Icon: PhotosIcon },
  { href: "/map", label: strings.more.menuMap, Icon: MapIcon },
  { href: "/messages", label: strings.more.menuMessages, Icon: MessagesIcon },
];

export function tabsForRole(role: string): NavItem[] {
  if (role === "kid") return kidTabs;
  if (role === "guest") return guestTabs;
  return ownerTabs;
}

export function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
