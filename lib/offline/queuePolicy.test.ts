import { describe, expect, it } from "vitest";
import { isDue, nextAttemptDelay, resolveFieldConflict } from "./queuePolicy";

describe("queue policy", () => {
  it("backs off exponentially and caps at an hour", () => {
    expect(nextAttemptDelay(1)).toBe(30_000);
    expect(nextAttemptDelay(2)).toBe(60_000);
    expect(nextAttemptDelay(4)).toBe(240_000);
    expect(nextAttemptDelay(20)).toBe(3_600_000);
  });

  it("waits until the next attempt time unless forced", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    expect(isDue({}, now)).toBe(true);
    expect(isDue({ nextAttemptAt: "2026-11-11T10:05:00Z" }, now)).toBe(false);
    expect(isDue({ nextAttemptAt: "2026-11-11T10:05:00Z" }, now, true)).toBe(true);
    expect(isDue({ nextAttemptAt: "2026-11-11T09:59:00Z" }, now)).toBe(true);
  });

  it("last write wins per field: a later server edit beats an older offline edit", () => {
    expect(resolveFieldConflict("2026-11-11T08:00:00Z", "2026-11-11T07:00:00Z")).toBe("apply");
    expect(resolveFieldConflict("2026-11-11T08:00:00Z", "2026-11-11T09:00:00Z")).toBe("server-wins");
    expect(resolveFieldConflict("2026-11-11T08:00:00Z", null)).toBe("row-gone");
  });
});
