// What is waiting for a parent's approval, across the screens that each hold
// their own queue (Hadar 20/10/2026: "I have to open every page to see if
// there is something to approve"). Pure helpers; the counts are loaded in
// lib/data/pendingApprovals.

import { strings } from "@/lib/strings";

export type PendingApprovals = {
  stories: number;
  photos: number;
  episodes: number;
  guestRequests: number;
};

export type PendingRow = { key: keyof PendingApprovals; href: string; label: string; count: number };

export const NO_PENDING: PendingApprovals = { stories: 0, photos: 0, episodes: 0, guestRequests: 0 };

export function totalPending(p: PendingApprovals): number {
  return p.stories + p.photos + p.episodes + p.guestRequests;
}

/** One row per screen with something waiting, in the order a parent works them. */
export function pendingRows(p: PendingApprovals): PendingRow[] {
  const a = strings.approvals;
  const rows: PendingRow[] = [
    { key: "guestRequests", href: "/guests", label: a.guestRequests, count: p.guestRequests },
    { key: "stories", href: "/stories", label: a.stories, count: p.stories },
    { key: "photos", href: "/photos", label: a.photos, count: p.photos },
    { key: "episodes", href: "/podcast", label: a.episodes, count: p.episodes },
  ];
  return rows.filter((r) => r.count > 0);
}
