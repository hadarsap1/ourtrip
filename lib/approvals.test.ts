import { describe, expect, it } from "vitest";
import { attentionRows, NO_PENDING, pendingRows, totalPending } from "./approvals";

describe("pending approvals", () => {
  it("nothing waiting: no rows, total 0", () => {
    expect(totalPending(NO_PENDING)).toBe(0);
    expect(pendingRows(NO_PENDING)).toEqual([]);
  });

  it("lists only the screens with something waiting, guests first", () => {
    const p = { stories: 2, photos: 0, episodes: 1, guestRequests: 3 };
    expect(totalPending(p)).toBe(6);
    expect(pendingRows(p).map((r) => [r.href, r.count])).toEqual([
      ["/guests", 3],
      ["/stories", 2],
      ["/podcast", 1],
    ]);
  });
});

describe("attention rows", () => {
  const none = { stories: 0, photos: 0, episodes: 0 };

  it("nothing waiting and nothing new: no rows", () => {
    expect(attentionRows(NO_PENDING, 0, none)).toEqual([]);
  });

  it("approvals first, then chat, then new likes and comments", () => {
    const rows = attentionRows(
      { stories: 0, photos: 2, episodes: 0, guestRequests: 0 },
      3,
      { stories: 1, photos: 0, episodes: 4 }
    );
    expect(rows.map((r) => [r.href, r.count, r.tone])).toEqual([
      ["/photos", 2, "waiting"],
      ["/messages", 3, "news"],
      ["/stories", 1, "news"],
      ["/podcast", 4, "news"],
    ]);
  });
});
