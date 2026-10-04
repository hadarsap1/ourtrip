import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedFetch, REQUEST_LIMIT_MS, requestLimitFor, storedAuthUserId } from "./supabase";
import { markReachable, offlineNow } from "./offline/network";

const REST = "https://abcd.supabase.co/rest/v1/documents";

afterEach(() => {
  markReachable();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("requestLimitFor", () => {
  it("limits reads and auth, gives functions longer, leaves uploads alone", () => {
    expect(requestLimitFor(REST)).toBe(REQUEST_LIMIT_MS);
    expect(requestLimitFor("https://abcd.supabase.co/auth/v1/token")).toBe(REQUEST_LIMIT_MS);
    expect(requestLimitFor("https://abcd.supabase.co/functions/v1/booking-paste")).toBeGreaterThan(REQUEST_LIMIT_MS);
    expect(requestLimitFor("https://abcd.supabase.co/storage/v1/object/docs/a.pdf")).toBeNull();
  });
});

describe("guardedFetch", () => {
  it("fails at once when the phone reports offline, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { onLine: false });
    await expect(guardedFetch(REST)).rejects.toBeInstanceOf(TypeError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aborts a hung request and then treats the line as dead", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn((_: unknown, init?: RequestInit) =>
        new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)))
      )
    );
    const p = guardedFetch(REST);
    vi.advanceTimersByTime(REQUEST_LIMIT_MS + 1);
    await expect(p).rejects.toBeTruthy();
    expect(offlineNow()).toBe(true);
    // the next call does not wait again
    await expect(guardedFetch(REST)).rejects.toBeInstanceOf(TypeError);
  });

  it("passes a response through", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    const res = await guardedFetch(REST);
    expect(await res.text()).toBe("[]");
  });
});

describe("storedAuthUserId", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store[k] ?? null } });
  });

  it("reads the user id from supabase-js's own slot", () => {
    store["sb-abcd-auth-token"] = JSON.stringify({ refresh_token: "r", user: { id: "u1" } });
    expect(storedAuthUserId()).toBe("u1");
  });

  it("ignores a slot without a refresh token, or garbage", () => {
    store["sb-abcd-auth-token"] = JSON.stringify({ user: { id: "u1" } });
    expect(storedAuthUserId()).toBeNull();
    store["sb-abcd-auth-token"] = "{oops";
    expect(storedAuthUserId()).toBeNull();
  });

  it("is null when signed out", () => {
    expect(storedAuthUserId()).toBeNull();
  });
});
