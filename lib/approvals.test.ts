import { describe, expect, it } from "vitest";
import { NO_PENDING, pendingRows, totalPending } from "./approvals";

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
