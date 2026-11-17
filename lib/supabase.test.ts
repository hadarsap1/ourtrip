import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedFetch, REQUEST_LIMIT_MS, requestLimitFor, sharedReadFetch, storedAuthUserId } from "./supabase";
import { PostgrestClient } from "@supabase/postgrest-js";
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
    await expect(guardedFetch(REST)).rejects.toMatchObject({ name: "AbortError" });
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
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(offlineNow()).toBe(true);
    // the next call does not wait again
    await expect(guardedFetch(REST)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("turns a network failure into an abort, so postgrest-js does not retry it for 7 s", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(guardedFetch(REST)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("postgrest-js gives up after ONE attempt (no 1/2/4 s retries)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const net = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", net);
    const rest = new PostgrestClient("https://abcd.supabase.co/rest/v1", { fetch: guardedFetch });
    const t0 = Date.now();
    const { error } = await rest.from("documents").select("*");
    expect(error).not.toBeNull();
    expect(net).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("a network failure marks the line down, and the next response clears it", async () => {
    const { networkDown } = await import("./offline/network");
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Load failed"); }));
    await expect(guardedFetch(REST)).rejects.toMatchObject({ name: "AbortError" });
    expect(networkDown()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    await guardedFetch(REST);
    expect(networkDown()).toBe(false);
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

describe("sharedReadFetch", () => {
  const slowFetch = () => {
    let release: (res: Response) => void = () => {};
    const spy = vi.fn(
      () =>
        new Promise<Response>((res) => {
          release = res;
        })
    );
    vi.stubGlobal("fetch", spy);
    vi.stubGlobal("navigator", { onLine: true });
    return { spy, release: (body: string) => release(new Response(body, { headers: { "content-range": "0-0/7" } })) };
  };
  const as = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

  it("sends identical reads that overlap once, and each caller reads its own body", async () => {
    const { spy, release } = slowFetch();
    const a = sharedReadFetch(REST + "?select=*", as("t1"));
    const b = sharedReadFetch(REST + "?select=*", as("t1"));
    release('[{"id":1}]');
    const [ra, rb] = await Promise.all([a, b]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await ra.json()).toEqual([{ id: 1 }]);
    expect(await rb.json()).toEqual([{ id: 1 }]);
    expect(rb.headers.get("content-range")).toBe("0-0/7");
  });

  it("does not share across people, addresses, count options or writes", async () => {
    const { spy } = slowFetch();
    void sharedReadFetch(REST + "?select=tag", as("t1"));
    void sharedReadFetch(REST + "?select=tag", as("t2"));
    void sharedReadFetch(REST + "?select=id", as("t1"));
    void sharedReadFetch(REST + "?select=tag", { headers: { Authorization: "Bearer t1", Prefer: "count=exact" } });
    void sharedReadFetch(REST, { method: "POST", ...as("t1") });
    void sharedReadFetch(REST, { method: "POST", ...as("t1") });
    void sharedReadFetch("https://abcd.supabase.co/functions/v1/recommend", as("t1"));
    void sharedReadFetch("https://abcd.supabase.co/functions/v1/recommend", as("t1"));
    expect(spy).toHaveBeenCalledTimes(8);
  });

  it("asks again once the first answer has arrived (nothing is cached)", async () => {
    const { spy, release } = slowFetch();
    const first = sharedReadFetch(REST + "?select=title", as("t1"));
    release("[]");
    await first;
    await Promise.resolve();
    void sharedReadFetch(REST + "?select=title", as("t1"));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
