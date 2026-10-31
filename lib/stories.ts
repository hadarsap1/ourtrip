// Pure rules for the stories screen (migration 00043). The database enforces
// who may see and change what; these only decide how a screen arranges it.

import type { Post, PostVisibility } from "@/lib/types";

export type StorySections<T extends Post = Post> = {
  /** A kid's story waiting for a parent (owners), or my own waiting (kids). */
  pending: T[];
  /** Mine, still being written. */
  drafts: T[];
  /** Published, newest first. */
  published: T[];
};

export function splitStories<T extends Post>(posts: T[], memberId: string | null): StorySections<T> {
  const pending: T[] = [];
  const drafts: T[] = [];
  const published: T[] = [];
  for (const post of posts) {
    if (post.status === "approved") published.push(post);
    else if (post.status === "pending") pending.push(post);
    else if (post.author_id === memberId) drafts.push(post);
  }
  // the journal reads by the day an entry is about, newest first (00078)
  const byPublished = (a: T, b: T) =>
    b.entry_date.localeCompare(a.entry_date) ||
    (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
  const byCreated = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return {
    pending: pending.sort(byCreated),
    drafts: drafts.sort(byCreated),
    published: published.sort(byPublished),
  };
}

/** A short headline from an entry's first line (a journal line has no title). */
export function titleFromJournal(body: string, max = 60): string {
  const first = body.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** What to call an entry in a share line: its title, else its first line. */
export function storyHeadline(post: Pick<Post, "title" | "body">): string {
  return post.title?.trim() || titleFromJournal(post.body) || "…";
}

/** Scheduled ("publish after we left") and not there yet. */
export function isScheduled(post: Pick<Post, "publish_after">, now = new Date()): boolean {
  return post.publish_after !== null && new Date(post.publish_after) > now;
}

/**
 * Who a story can be offered to. A kid's story stops at guests (00043 raises
 * for anything else); a parent's can go public.
 */
export function audienceOptions(authorRole: string | undefined): PostVisibility[] {
  return authorRole === "owner" ? ["family", "guests", "public"] : ["family", "guests"];
}

/** Long bodies fold in the feed. */
export function needsFold(body: string, maxChars = 420, maxLines = 7): boolean {
  return body.length > maxChars || body.split(/\r?\n/).length > maxLines;
}

/** `datetime-local` value (local time, minutes) <-> ISO. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
