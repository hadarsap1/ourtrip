// Who hears about a new update or podcast episode by push (00100, DECISIONS
// #71) - the same rule as the guest policies, for the one place that decides
// with the service role: push-send. Never wider than the database:
//
//   story   - posts_guest_select (00063): an active guest; audience '{}' is
//             every guest, otherwise only guests in one of its groups
//   episode - episodes_guest_select (00059): every active guest
//
// The caller passes only items guests may already see (approved, visibility
// guests/public, past publish_after; or approved AND shared for an episode).
// Parents and kids are never recipients: they have their own notifications.

import { inQuietHours, localNow } from "./notifyPolicy.ts";

export type GuestRow = { id: string; role: string; email: string | null };
export type AllowRow = { email: string; labels: string[] | null };
export type GuestItem = { kind: "story" | "episode"; audience: string[] };

export function guestUpdateRecipients(members: GuestRow[], allowlist: AllowRow[], item: GuestItem): string[] {
  // a revoked guest keeps the members row, and maybe a subscription
  const active = new Map(allowlist.map((a) => [a.email.toLowerCase(), a.labels ?? []]));
  return members
    .filter((m) => {
      if (m.role !== "guest" || !m.email) return false;
      const labels = active.get(m.email.toLowerCase());
      if (labels === undefined) return false;
      if (item.kind === "episode" || item.audience.length === 0) return true;
      return item.audience.some((g) => labels.includes(g));
    })
    .map((m) => m.id);
}

/** The guests are in Israel, whatever country the family is in. */
export const GUEST_ZONE = "Asia/Jerusalem";

/** 22:00-07:00 at home: hold the push; the 15-minute sweep sends it at 07:00. */
export function guestQuietNow(now: Date): boolean {
  return inQuietHours(localNow(now, GUEST_ZONE).minutes);
}
