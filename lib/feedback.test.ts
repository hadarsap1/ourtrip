import { describe, expect, it } from "vitest";
import { namesSummary, tallyReactions } from "./feedback";
import type { Reaction } from "./types";

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
