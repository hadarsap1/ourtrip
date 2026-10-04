import { afterEach, describe, expect, it, vi } from "vitest";
import { DEAD_LINE_MS, markReachable, markUnreachable, offlineNow, TimeoutError, withTimeout } from "./network";

afterEach(() => {
  markReachable();
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("passes a fast result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejects a hanging promise after the limit", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 100);
    vi.advanceTimersByTime(101);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it("keeps the original error", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});

describe("dead line", () => {
  it("counts as offline for DEAD_LINE_MS after a timeout, then recovers", () => {
    const t = 1_000_000;
    expect(offlineNow(t)).toBe(false);
    markUnreachable(t);
    expect(offlineNow(t + 1)).toBe(true);
    expect(offlineNow(t + DEAD_LINE_MS + 1)).toBe(false);
  });

  it("a response clears it at once", () => {
    markUnreachable();
    markReachable();
    expect(offlineNow()).toBe(false);
  });
});
