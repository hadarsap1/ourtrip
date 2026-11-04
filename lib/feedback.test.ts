import { describe, expect, it } from "vitest";
import { feedbackCounts, namesSummary, newBaseline, newFeedback, newFeedbackByKind, tallyReactions } from "./feedback";
import type { Comment, Reaction } from "./types";

const r = (over: Partial<Reaction>): Reaction => ({
  id: "r",
  trip_id: "t",
  member_id: "m",
  post_id: "p1",
  episode_id: null,
  photo_id: null,
  kind: "heart",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("tallyReactions", () => {
  it("counts per kind for one target, marks mine, lists people once", () => {
    const reactions = [
      r({ id: "1", member_id: "savta", kind: "heart" }),
      r({ id: "2", member_id: "me", kind: "heart" }),
      r({ id: "3", member_id: "savta", kind: "star" }),
      r({ id: "4", member_id: "other", post_id: "p2" }),
      r({ id: "5", member_id: "x", post_id: null, episode_id: "p1" }),
    ];
    const { tallies, memberIds } = tallyReactions(reactions, { postId: "p1" }, "me");
    expect(tallies.find((t) => t.kind === "heart")).toEqual({ kind: "heart", count: 2, mineId: "2" });
    expect(tallies.find((t) => t.kind === "star")).toEqual({ kind: "star", count: 1, mineId: null });
    expect(memberIds).toEqual(["savta", "me"]);
  });

  it("keeps episode likes apart from story likes with the same id", () => {
    const { tallies } = tallyReactions([r({ post_id: null, episode_id: "e1" })], { episodeId: "e1" }, null);
    expect(tallies[0].count).toBe(1);
  });
});

describe("namesSummary", () => {
  it("shows up to three names and counts the rest", () => {
    expect(namesSummary(["א", "ב"])).toEqual({ shown: "א, ב", more: 0 });
    expect(namesSummary(["א", "ב", "ג", "ד", "ה"])).toEqual({ shown: "א, ב, ג", more: 2 });
    expect(namesSummary(["", "א"])).toEqual({ shown: "א", more: 0 });
  });
});

describe("photo targets (00077)", () => {
  it("counts only the photo's own likes", () => {
    const rows = [
      r({ id: "a", post_id: null, photo_id: "ph1", kind: "heart" }),
      r({ id: "b", post_id: null, photo_id: "ph2", kind: "heart" }),
      r({ id: "c", post_id: "ph1", kind: "heart" }),
    ];
    const { tallies } = tallyReactions(rows, { photoId: "ph1" }, null);
    expect(tallies.find((t) => t.kind === "heart")?.count).toBe(1);
  });
});

const c = (over: Partial<Comment>): Comment =>
  ({
    id: "c",
    trip_id: "t",
    author_id: "savta",
    post_id: null,
    episode_id: null,
    photo_id: "ph1",
    body: "יפה",
    created_at: "2026-11-02T10:00:00Z",
    shown_to_kids_at: null,
    shown_by: null,
    ...over,
  }) as Comment;

describe("newFeedback", () => {
  const target = { photoId: "ph1" };
  const comments = [
    c({ id: "old", created_at: "2026-11-01T08:00:00Z" }),
    c({ id: "fresh" }),
    c({ id: "mine", author_id: "me" }),
    c({ id: "elsewhere", photo_id: "ph2" }),
  ];
  const reactions = [
    r({ id: "1", post_id: null, photo_id: "ph1", member_id: "savta", created_at: "2026-11-02T09:00:00Z" }),
    r({ id: "2", post_id: null, photo_id: "ph1", member_id: "me", created_at: "2026-11-02T09:00:00Z" }),
    r({ id: "3", post_id: null, photo_id: "ph1", member_id: "dana", created_at: "2026-10-30T09:00:00Z" }),
  ];

  it("counts only what someone else wrote after I looked", () => {
    const got = newFeedback(target, comments, reactions, "me", "2026-11-01T12:00:00Z");
    expect([...got.commentIds]).toEqual(["fresh"]);
    expect(got.likes).toBe(1);
  });

  it("is empty while the seen marks are not known yet", () => {
    const got = newFeedback(target, comments, reactions, "me", null);
    expect(got.commentIds.size).toBe(0);
    expect(got.likes).toBe(0);
  });

  it("with no mark, looks back a week", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    const got = newFeedback(target, comments, reactions, "me", newBaseline(now));
    expect([...got.commentIds].sort()).toEqual(["fresh", "old"]);
    expect(got.likes).toBe(2);
  });
});

describe("feedbackCounts", () => {
  it("counts one target's comments and likes", () => {
    const got = feedbackCounts(
      { photoId: "ph1" },
      [c({ id: "a" }), c({ id: "b", photo_id: "ph2" })],
      [r({ post_id: null, photo_id: "ph1" }), r({ post_id: "p1" })]
    );
    expect(got).toEqual({ comments: 1, likes: 1 });
  });
});

describe("newFeedbackByKind", () => {
  const stamp = (target: "post_id" | "photo_id" | "episode_id", id: string, at: string) => ({
    post_id: null,
    photo_id: null,
    episode_id: null,
    [target]: id,
    created_at: at,
  });
  const seen: Record<string, string> = { p1: "2026-11-02T00:00:00Z" };
  const since = (id: string) => seen[id] ?? "2026-11-01T00:00:00Z";

  it("counts each target once, by kind, only after its seen mark", () => {
    const got = newFeedbackByKind(
      [
        stamp("post_id", "p1", "2026-11-01T12:00:00Z"), // before p1's mark
        stamp("post_id", "p2", "2026-11-03T00:00:00Z"),
        stamp("post_id", "p2", "2026-11-03T01:00:00Z"),
        stamp("photo_id", "ph1", "2026-11-03T00:00:00Z"),
        stamp("episode_id", "e1", "2026-10-30T00:00:00Z"), // before the baseline
      ],
      since
    );
    expect(got).toEqual({ stories: 1, photos: 1, episodes: 0 });
  });

  it("is nothing while the seen marks are unknown", () => {
    expect(newFeedbackByKind([stamp("post_id", "p2", "2026-11-03T00:00:00Z")], () => null)).toEqual({
      stories: 0,
      photos: 0,
      episodes: 0,
    });
  });
});
