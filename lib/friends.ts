import type { FriendLink } from "@/lib/data/friends";

/** A friend's account (00110) has a made-up address that receives no mail. */
export function isFriendEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@kids.ourtrip.app");
}

export type FriendState = "waiting" | "expired" | "connected" | "revoked";

export function friendState(
  link: Pick<FriendLink, "used_at" | "revoked_at" | "expires_at">,
  now = new Date()
): FriendState {
  if (link.revoked_at) return "revoked";
  if (link.used_at) return "connected";
  return new Date(link.expires_at) > now ? "waiting" : "expired";
}

/** The message a parent sends the friend's parent with a fresh code. */
export function friendInvite(template: string, values: { kid: string; url: string; code: string }): string {
  return template
    .replace("{kid}", () => values.kid)
    .replace("{url}", () => values.url)
    .replace("{code}", () => values.code);
}

export type FriendGroup<T> = { key: string; links: T[] };

/** A parent's list, one entry per friend (00111): every chat of a connected
 *  friend together, oldest chat first; a code not used yet stands alone.
 *  Friends keep the order of their newest row in `links`. */
export function groupFriendLinks<T extends Pick<FriendLink, "id" | "member_id" | "created_at">>(
  links: T[]
): FriendGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const link of links) {
    const key = link.member_id ?? link.id;
    const list = groups.get(key);
    if (list) list.push(link);
    else groups.set(key, [link]);
  }
  return [...groups].map(([key, list]) => ({
    key,
    links: [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
