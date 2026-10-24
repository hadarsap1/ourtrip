import { describe, expect, it } from "vitest";
import { prefetchDue } from "./prefetch";

describe("prefetchDue", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("runs the first time and when forced", () => {
    expect(prefetchDue(null, now)).toBe(true);
    expect(prefetchDue("2026-11-11T11:59:00Z", now, true)).toBe(true);
  });
  it("waits six hours between runs", () => {
    expect(prefetchDue("2026-11-11T07:00:00Z", now)).toBe(false);
    expect(prefetchDue("2026-11-11T06:00:00Z", now)).toBe(true);
    expect(prefetchDue("garbage", now)).toBe(true);
  });
});
