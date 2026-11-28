import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the 24/11/2026 egress bill: a fresh signed URL on
// every list load gave each <img> a new address, so the same photo was
// downloaded ~22 times a day. A path signed once must be reused while live.
const createSignedUrls = vi.fn(async (paths: string[]) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://x.supabase.co/sign/${path}?token=${Math.random()}` })),
  error: null,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
  onSignedOut: () => {},
}));

const { signPaths, clearSignedCache, forgetSignedUrl, splitCached, rememberSigned, REUSE_MARGIN_MS } = await import("./signedUrls");

describe("signPaths", () => {
  beforeEach(() => {
    clearSignedCache();
    createSignedUrls.mockClear();
  });

  it("hands back the same URL on a second load, without asking again", async () => {
    const first = await signPaths("photos", ["t/a.jpg", "t/b.jpg"], 3600);
    const second = await signPaths("photos", ["t/a.jpg", "t/b.jpg"], 3600);
    expect(second.get("t/a.jpg")).toBe(first.get("t/a.jpg"));
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("signs only the paths it has not seen", async () => {
    await signPaths("photos", ["t/a.jpg"], 3600);
    await signPaths("photos", ["t/a.jpg", "t/c.jpg"], 3600);
    expect(createSignedUrls).toHaveBeenLastCalledWith(["t/c.jpg"], 3600);
  });

  it("keeps buckets apart", async () => {
    await signPaths("photos", ["t/a.jpg"], 3600);
    await signPaths("gphotos", ["t/a.jpg"], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("signs again a URL that failed to load (28/11/2026)", async () => {
    const first = await signPaths("photos", ["t/a.jpg"], 3600);
    forgetSignedUrl(first.get("t/a.jpg")!);
    const second = await signPaths("photos", ["t/a.jpg"], 3600);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(second.get("t/a.jpg")).not.toBe(first.get("t/a.jpg"));
  });
});

describe("splitCached", () => {
  beforeEach(() => clearSignedCache());

  it("re-signs a URL about to expire", () => {
    const now = 1_000_000;
    rememberSigned("photos", "t/a.jpg", "u", now, 60 * 60);
    expect(splitCached("photos", ["t/a.jpg"], now).missing).toEqual([]);
    const late = now + 60 * 60 * 1000 - REUSE_MARGIN_MS + 1;
    expect(splitCached("photos", ["t/a.jpg"], late).missing).toEqual(["t/a.jpg"]);
  });
});
