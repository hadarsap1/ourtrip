import { describe, expect, it } from "vitest";
import { captureColumns } from "@/components/BottomNav";

/** The slot's centre as a fraction of the bar, ignoring the slot's own fixed width. */
function sidesBalance(template: string): [number, number] {
  const parts = [...template.matchAll(/repeat\((\d+), minmax\(0, (\d+)fr\)\)/g)].map((m) => Number(m[1]) * Number(m[2]));
  return [parts[0], parts[1]];
}

describe("captureColumns", () => {
  it("gives both sides of the capture button the same width, so it sits in the centre", () => {
    const template = captureColumns(5);
    expect(template).toBe("repeat(2, minmax(0, 3fr)) 3.5rem repeat(3, minmax(0, 2fr))");
    const [before, after] = sidesBalance(template);
    expect(before).toBe(after);
  });

  it("stays balanced for other tab counts", () => {
    for (const n of [3, 4, 6]) {
      const [before, after] = sidesBalance(captureColumns(n));
      expect(before).toBe(after);
    }
  });
});
