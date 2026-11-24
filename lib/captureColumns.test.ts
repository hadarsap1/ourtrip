import { describe, expect, it } from "vitest";
import { captureColumns } from "@/components/BottomNav";

describe("captureColumns", () => {
  it("gives every slot, the capture button's included, the same width", () => {
    expect(captureColumns(5)).toBe("repeat(6, minmax(0, 1fr))");
  });

  it("counts the capture slot for other tab counts too", () => {
    expect(captureColumns(3)).toBe("repeat(4, minmax(0, 1fr))");
    expect(captureColumns(6)).toBe("repeat(7, minmax(0, 1fr))");
  });
});
