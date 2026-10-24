import { describe, expect, it } from "vitest";
import { hashToken, newToken, parseIngest, tooSoon } from "./stepsIngest";

const now = new Date("2026-11-10T14:00:00Z");
const token = "A".repeat(43);

describe("steps ingest validation (Phase 2)", () => {
  it("accepts a well-formed post and defaults the date to today", () => {
    expect(parseIngest({ token, steps: 12345 }, now)).toEqual({ token, steps: 12345, date: "2026-11-10" });
    expect(parseIngest({ token, steps: "12,345", date: "2026-11-09" }, now)).toEqual({ token, steps: 12345, date: "2026-11-09" });
    expect(parseIngest({ token, steps: 8123.6 }, now)).toMatchObject({ steps: 8124 });
  });

  it("rejects bad tokens, steps and dates", () => {
    expect(parseIngest(null, now)).toEqual({ error: "bad_request" });
    expect(parseIngest({ token: "short", steps: 1 }, now)).toEqual({ error: "bad_token" });
    expect(parseIngest({ token, steps: -1 }, now)).toEqual({ error: "bad_steps" });
    expect(parseIngest({ token, steps: 250000 }, now)).toEqual({ error: "bad_steps" });
    expect(parseIngest({ token, steps: "lots" }, now)).toEqual({ error: "bad_steps" });
    expect(parseIngest({ token, steps: 1, date: "2026-11-06" }, now)).toEqual({ error: "bad_date" }); // 4 days ago
    expect(parseIngest({ token, steps: 1, date: "2026-11-12" }, now)).toEqual({ error: "bad_date" }); // 2 days ahead
    expect(parseIngest({ token, steps: 1, date: "2026-02-30" }, now)).toEqual({ error: "bad_date" });
    expect(parseIngest({ token, steps: 1, date: "2026-11-11" }, now)).toMatchObject({ date: "2026-11-11" }); // tomorrow UTC = today in Tokyo
  });

  it("makes 43-char base64url tokens that the parser accepts, and stable hex hashes", async () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parseIngest({ token: t, steps: 1 }, now)).toMatchObject({ token: t });
    const h = await hashToken("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(newToken()).not.toBe(t);
  });

  it("throttles a phone that posts again within 20 seconds", () => {
    expect(tooSoon(null, now)).toBe(false);
    expect(tooSoon("2026-11-10T13:59:50Z", now)).toBe(true);
    expect(tooSoon("2026-11-10T13:59:30Z", now)).toBe(false);
  });
});
