import { describe, expect, it } from "vitest";
import { settleSwipe } from "@/components/ui/SwipeRow";

describe("settleSwipe", () => {
  it("snaps closed under 72px, open past it, commits past half the row", () => {
    expect(settleSwipe(-40, 358)).toBe("closed");
    expect(settleSwipe(-100, 358)).toBe("open");
    expect(settleSwipe(-200, 358)).toBe("commit");
  });
});
