import { describe, expect, it } from "vitest";
import { groupEmptyRuns } from "./emptyRuns";

const d = (date: string) => ({ id: date, date });
const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map(d);

describe("groupEmptyRuns (F4)", () => {
  it("collapses 2+ consecutive empty days into one block", () => {
    const planned = new Set(["2026-11-01", "2026-11-05"]);
    const blocks = groupEmptyRuns(days, (x) => !planned.has(x.date), "2026-10-01");
    expect(blocks.map((b) => (b.kind === "day" ? b.day.date : `${b.from}..${b.to}`))).toEqual([
      "2026-11-01",
      "2026-11-02..2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  it("never hides today inside a run", () => {
    const blocks = groupEmptyRuns(days, () => true, "2026-11-03");
    expect(blocks.map((b) => b.kind)).toEqual(["empty-run", "day", "empty-run"]);
    expect(blocks[1]).toEqual({ kind: "day", day: d("2026-11-03") });
  });

  it("a whole empty 230-day trip renders as a handful of rows", () => {
    const many = Array.from({ length: 230 }, (_, i) => d(`x${String(i).padStart(3, "0")}`));
    expect(groupEmptyRuns(many, () => true, "none")).toHaveLength(1);
  });
});
