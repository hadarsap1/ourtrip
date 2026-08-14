import { describe, expect, it } from "vitest";
import { assertMatched, conflictError, isConflictError } from "./concurrency";

describe("optimistic concurrency guard", () => {
  it("passes when the guarded update matched its row", () => {
    expect(() => assertMatched(1, "2026-08-14T10:00:00Z")).not.toThrow();
  });

  it("raises a conflict when a guarded update matched nothing", () => {
    // Zero rows under a version guard means the other owner saved first.
    expect(() => assertMatched(0, "2026-08-14T10:00:00Z")).toThrow();
    try {
      assertMatched(0, "2026-08-14T10:00:00Z");
    } catch (e) {
      expect(isConflictError(e)).toBe(true);
    }
  });

  it("stays silent for an unguarded update that matched nothing", () => {
    // No expected version = last-write-wins by intent (offline replay, status
    // ticks). A no-op there is not a conflict and must not raise one.
    expect(() => assertMatched(0, undefined)).not.toThrow();
  });

  it("does not mistake an ordinary failure for a conflict", () => {
    expect(isConflictError(new Error("failed to fetch"))).toBe(false);
    expect(isConflictError(conflictError())).toBe(true);
    expect(isConflictError("conflict")).toBe(false);
  });
});
