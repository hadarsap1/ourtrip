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

export type AttentionRow = {
  key: string;
  href: string;
  label: string;
  /** A number badge; null = something new without a count worth showing. */
  count: number | null;
  tone: "waiting" | "news";
};

/**
 * Everything waiting for a parent in one card on the home screen (UX pass
 * 06/11/2026): the approval queues first - they block someone else - then
 * unread chat, then new likes and comments. Before this the approvals were on
 * the home screen and the rest only a dot on "עוד".
 */
export function attentionRows(
  p: PendingApprovals,
  unreadChat: number,
  fresh: { stories: number; photos: number; episodes: number }
): AttentionRow[] {
  const a = strings.attention;
  const rows: AttentionRow[] = pendingRows(p).map((r) => ({
    key: `pending-${r.key}`,
    href: r.href,
    label: r.label,
    count: r.count,
    tone: "waiting",
  }));
  if (unreadChat > 0) {
    rows.push({ key: "chat", href: "/messages", label: a.chat, count: unreadChat, tone: "news" });
  }
  const feedback: [keyof typeof fresh, string, string][] = [
    ["stories", "/stories", a.feedbackStories],
    ["photos", "/photos", a.feedbackPhotos],
    ["episodes", "/podcast", a.feedbackEpisodes],
  ];
  for (const [key, href, label] of feedback) {
    if (fresh[key] > 0) rows.push({ key: `fresh-${key}`, href, label, count: fresh[key], tone: "news" });
  }
  return rows;
}
