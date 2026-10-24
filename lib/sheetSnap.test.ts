import { describe, expect, it } from "vitest";
import { settleSnap, snapHeight } from "@/components/ui/BottomSheet";

describe("bottom sheet snaps", () => {
  const H = 800;
  it("computes the three heights", () => {
    expect(snapHeight("peek", H)).toBe(96);
    expect(snapHeight("half", H)).toBe(400);
    expect(snapHeight("full", H)).toBe(752);
  });
  it("settles on the nearest snap after a slow drag", () => {
    expect(settleSnap("half", 700, H, 0)).toBe("full");
    expect(settleSnap("half", 150, H, 0)).toBe("peek");
    expect(settleSnap("half", 430, H, 0)).toBe("half");
  });
  it("a fling moves exactly one step", () => {
    expect(settleSnap("peek", 120, H, -0.8)).toBe("half");
    expect(settleSnap("full", 740, H, 0.9)).toBe("half");
    expect(settleSnap("full", 740, H, -0.9)).toBe("full");
  });
});
