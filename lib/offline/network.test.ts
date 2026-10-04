import { describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./network";

describe("withTimeout", () => {
  it("passes a fast result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejects a hanging promise after the limit", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 100);
    vi.advanceTimersByTime(101);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    vi.useRealTimers();
  });

  it("keeps the original error", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});
