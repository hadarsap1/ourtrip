import { describe, expect, it } from "vitest";
import {
  advanceHeard,
  formatClock,
  heardPercent,
  mergePendingView,
  seekHeard,
  viewKey,
  viewersOf,
  type HeardState,
} from "./views";
import type { ContentView, Member } from "./types";

const member = (over: Partial<Member>): Member => ({
  id: "m",
  trip_id: "t",
  auth_user_id: null,
  email: null,
  display_name: "x",
  role: "guest",
  created_at: "2026-11-01T00:00:00Z",
  is_preview: false,
  ...over,
} as Member);

const view = (over: Partial<ContentView>): ContentView => ({
  id: "v",
  trip_id: "t",
  member_id: "g1",
  post_id: "p1",
  photo_id: null,
  episode_id: null,
  first_viewed_at: "2026-11-01T10:00:00Z",
  last_viewed_at: "2026-11-01T10:00:00Z",
  heard_seconds: 0,
  ...over,
});

describe("viewKey / mergePendingView", () => {
  it("keys each target by kind", () => {
    expect(viewKey({ postId: "a" })).toBe("post:a");
    expect(viewKey({ photoId: "a" })).toBe("photo:a");
    expect(viewKey({ episodeId: "a" })).toBe("episode:a");
  });

  it("keeps the furthest heard and the latest time", () => {
    const a = { key: "episode:e", target: { episodeId: "e" }, heardSeconds: 90, at: "2026-11-02T10:00:00Z" };
    const b = { ...a, heardSeconds: 30, at: "2026-11-01T10:00:00Z" };
    expect(mergePendingView(a, b)).toMatchObject({ heardSeconds: 90, at: "2026-11-02T10:00:00Z" });
    expect(mergePendingView(undefined, b)).toBe(b);
  });
});

describe("advanceHeard", () => {
  const run = (steps: Array<number | ["seek", number]>): HeardState =>
    steps.reduce<HeardState>(
      (s, step) => (Array.isArray(step) ? seekHeard(s, step[1]) : advanceHeard(s, step)),
      { last: null, heard: 0 }
    );

  it("counts continuous playback", () => {
    expect(run([0, 0.25, 0.5, 1, 1.25, 2]).heard).toBe(2);
  });

  it("a jump forward is not heard", () => {
    expect(run([0, 1, 2, ["seek", 500], 500.25, 501]).heard).toBe(501);
    expect(run([0, 1, 2, 500]).heard).toBe(2);
  });

  it("listening again from the start does not lower it", () => {
    expect(run([0, 1, 2, 3, ["seek", 0], 0.5, 1]).heard).toBe(3);
  });

  it("starting mid-episode without a seek event does not count the start", () => {
    expect(run([300]).heard).toBe(0);
  });
});

describe("viewersOf", () => {
  const members = [
    member({ id: "g1", display_name: "סבתא" }),
    member({ id: "g2", display_name: "דוד" }),
    member({ id: "test", display_name: "🧪 אורח בדיקה", is_preview: true }),
    member({ id: "kid", role: "kid" }),
  ];

  it("lists real guests of this target only, latest first", () => {
    const views = [
      view({ id: "1", member_id: "g1", last_viewed_at: "2026-11-01T10:00:00Z" }),
      view({ id: "2", member_id: "g2", last_viewed_at: "2026-11-03T10:00:00Z" }),
      view({ id: "3", member_id: "test" }),
      view({ id: "4", member_id: "kid" }),
      view({ id: "5", member_id: "gone" }),
      view({ id: "6", member_id: "g1", post_id: "p2" }),
    ];
    expect(viewersOf(views, { postId: "p1" }, members).map((v) => v.member.id)).toEqual(["g2", "g1"]);
  });

  it("matches photos and episodes by their own column", () => {
    const views = [view({ post_id: null, photo_id: "ph" }), view({ id: "e", post_id: null, episode_id: "ep" })];
    expect(viewersOf(views, { photoId: "ph" }, members)).toHaveLength(1);
    expect(viewersOf(views, { episodeId: "ep" }, members)).toHaveLength(1);
    expect(viewersOf(views, { postId: "ph" }, members)).toHaveLength(0);
  });
});

describe("formatClock / heardPercent", () => {
  it("formats seconds as a clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(754)).toBe("12:34");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("is a whole percent, capped, or null without a length", () => {
    expect(heardPercent(300, 600)).toBe(50);
    expect(heardPercent(700, 600)).toBe(100);
    expect(heardPercent(300, null)).toBeNull();
  });
});
