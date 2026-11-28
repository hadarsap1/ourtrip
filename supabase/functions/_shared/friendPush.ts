// Friend chat messages → the other side, and the parents when a kid's message
// waits unread (00112, DECISIONS #80). Pure and Deno/Node neutral so vitest
// covers it (friendPush.test.ts).
//
// Never a message's words: "a new message from X" only. The kid's and the
// friend's pushes fold per chat on the device (tag per chat, public/sw.js);
// the parents get ONE push per run, whatever the number of kids and messages.

/** One row of claim_friend_pushes(). */
export type FriendPushRow = {
  kind: "message" | "parents";
  link_id: string;
  member_id: string;
  from_name: string;
  kid_name: string;
  n: number;
  since: string | null;
};

export type FriendPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  many?: string;
  count?: number;
  badge?: boolean;
  manyUrl?: string;
};

export const FRIEND_WAITING_TAG = "friend-waiting";

export function friendChatUrl(linkId: string): string {
  return `/friends?chat=${linkId}`;
}

/** The push to the kid or the friend: who wrote, never what. */
export function friendMessagePayload(row: FriendPushRow): FriendPushPayload {
  const n = Math.max(1, row.n);
  const many = `💬 {n} הודעות חדשות מ${row.from_name}`;
  const url = friendChatUrl(row.link_id);
  return {
    title: n === 1 ? `💬 הודעה חדשה מ${row.from_name}` : many.replace("{n}", String(n)),
    body: "לחיצה פותחת את הצ'אט",
    url,
    tag: `friend-${row.link_id}`,
    many,
    count: n,
    badge: true,
    manyUrl: url,
  };
}

function minutesSince(since: string | null, now: Date): number {
  if (!since) return 0;
  return Math.max(1, Math.round((now.getTime() - new Date(since).getTime()) / 60000));
}

/** The one push to the parents for every kid's message waiting this run, or
 *  null when none waits. */
export function friendParentsPayload(rows: FriendPushRow[], now: Date): FriendPushPayload | null {
  const due = rows.filter((r) => r.kind === "parents");
  if (due.length === 0) return null;
  if (due.length === 1) {
    const r = due[0];
    const mins = minutesSince(r.since, now);
    const what = r.n > 1 ? `${r.n} הודעות מ${r.from_name}` : `הודעה מ${r.from_name}`;
    return {
      title: `💬 מחכה הודעה ל${r.kid_name}`,
      body: `${what}, כבר ${mins} דקות`,
      url: friendChatUrl(r.link_id),
      tag: FRIEND_WAITING_TAG,
    };
  }
  return {
    title: "💬 מחכות הודעות לילדים",
    body: due.map((r) => `${r.kid_name} - מ${r.from_name}`).join(", "),
    url: "/friends",
    tag: FRIEND_WAITING_TAG,
  };
}
