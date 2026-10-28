// Group audiences (migrations 00063/00064): who a wall message, story or
// photo goes to. '[]' = everyone; otherwise the guest groups it is limited
// to. The database decides who may read what; these helpers only decide what
// to show and offer. Pure - tested in audience.test.ts.

/**
 * The family (parents and kids) can always address the basic groups, even
 * before any guest is in one - so a class can be written to ahead of time.
 * A guest only ever gets their own groups.
 */
export function withDefaultGroups(
  groups: string[],
  role: "owner" | "kid" | "guest",
  defaults: readonly string[]
): string[] {
  return role === "guest" ? groups : [...new Set([...defaults, ...groups])];
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

/**
 * Whether a photo may get a copy on the open blog (00046). The open page is
 * wider than any guest, so it needs at least what a guest needs (hard rule 3:
 * approved AND shared), and a photo kept for some groups (00064) stays in the
 * app. A public story whose photos the parent chose not to share shows none.
 */
export function photoMayGoPublic(photo: {
  status: string;
  shared_with_guests: boolean;
  audience: string[];
}): boolean {
  return photo.status === "approved" && photo.shared_with_guests && photo.audience.length === 0;
}
