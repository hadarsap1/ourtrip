// Group audiences (migration 00063): who a wall message, story or photo goes
// to. '[]' = everyone; otherwise the guest groups it is limited to. The
// database decides who may read what; these helpers only decide what to show
// and offer. Pure - tested in audience.test.ts.

/** The wall tab a message is read and written in: "כולם" or one group. */
export type WallTab = { kind: "everyone" } | { kind: "group"; label: string };

export const EVERYONE: WallTab = { kind: "everyone" };

export function tabKey(tab: WallTab): string {
  return tab.kind === "everyone" ? "*" : `g:${tab.label}`;
}

/** Messages shown in a tab: "כולם" holds the '[]' ones, a group tab every
 *  message that includes the group (one to two groups shows in both). */
export function inTab<T extends { audience: string[] }>(messages: T[], tab: WallTab): T[] {
  return tab.kind === "everyone"
    ? messages.filter((m) => m.audience.length === 0)
    : messages.filter((m) => m.audience.includes(tab.label));
}

/** What a message written in this tab is sent to. */
export function audienceForTab(tab: WallTab): string[] {
  return tab.kind === "everyone" ? [] : [tab.label];
}

/**
 * The tabs a viewer gets: "כולם" first, then their groups (alphabetical).
 * A group that only appears on messages they can read (a parent widened a
 * message to it) is added too, so nothing they can read is out of reach.
 * No groups → no tabs at all: the wall looks as it always did.
 */
export function wallTabs(groups: string[], messages: { audience: string[] }[]): WallTab[] {
  const all = new Set(groups);
  for (const m of messages) for (const g of m.audience) all.add(g);
  if (all.size === 0) return [];
  return [
    EVERYONE,
    ...[...all].sort((a, b) => a.localeCompare(b, "he")).map((label): WallTab => ({ kind: "group", label })),
  ];
}

/** "כיתה עומר, כיתה אלה" - or null for everyone. */
export function audienceText(audience: string[]): string | null {
  return audience.length === 0 ? null : audience.join(", ");
}

/**
 * A photo's audience once a story shares it (DECISIONS #5 still: the parent
 * shares on purpose). Whoever uploaded a photo for some groups keeps it there
 * (00064) - a story never opens it wider by itself:
 *   not shared yet      - its own groups if it has any, else the story's
 *   shared with everyone - stays everyone
 *   shared with groups  - those, plus a group story's groups
 */
export function photoAudienceAfterShare(
  photo: { shared_with_guests: boolean; audience: string[] },
  storyAudience: string[]
): string[] {
  if (!photo.shared_with_guests) return photo.audience.length > 0 ? photo.audience : storyAudience;
  if (photo.audience.length === 0) return [];
  return [...new Set([...photo.audience, ...storyAudience])];
}
