import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ rpc }) }));

import { BOOT_FRESH_MS, freshBoot, invalidateBoot, parseBoot, requestBoot } from "./boot";

afterEach(() => {
  rpc.mockReset();
  invalidateBoot();
});

const answer = {
  role: "owner",
  member: { id: "m1", role: "owner", auth_user_id: "u1" },
  trip: { id: "t1" },
  today: { date: "2026-11-15", day: { id: "d1" }, items: [{ id: "i1" }], bookings: [] },
  pending: { stories: 1, photos: 7, episodes: 0, guestRequests: 2 },
};

describe("parseBoot", () => {
  it("reads a full answer", () => {
    const b = parseBoot(answer);
    expect(b.role).toBe("owner");
    expect(b.member?.id).toBe("m1");
    expect(b.today?.items).toHaveLength(1);
    expect(b.pending).toEqual({ stories: 1, photos: 7, episodes: 0, guestRequests: 2 });
  });

  it("reads 'no member' and garbage as nothing, never as a role", () => {
    expect(parseBoot({ role: null })).toEqual({ role: null, member: null, trip: null, today: null, pending: null });
    expect(parseBoot(null).role).toBeNull();
    expect(parseBoot({ role: "admin", member: { id: "x" } })).toMatchObject({ role: null, member: null });
    expect(parseBoot({ role: "guest", today: { date: "2026-11-15", items: "x" }, pending: { photos: "9" } })).toMatchObject({
      today: { day: null, items: [], bookings: [] },
      pending: { photos: 0 },
    });
  });
});

describe("requestBoot / freshBoot", () => {
  it("asks once for everyone who asks while the answer is fresh", async () => {
    rpc.mockResolvedValue({ data: answer, error: null });
    const [a, b] = await Promise.all([requestBoot(1000), requestBoot(1500)]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect((await freshBoot(2000))?.trip?.id).toBe("t1");
  });

  it("serves nothing once stale, without asking again by itself", async () => {
    rpc.mockResolvedValue({ data: answer, error: null });
    await requestBoot(1000);
    expect(await freshBoot(1000 + BOOT_FRESH_MS)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("a new open after the window asks again", async () => {
    rpc.mockResolvedValue({ data: answer, error: null });
    await requestBoot(1000);
    await requestBoot(1000 + BOOT_FRESH_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("says 'unsupported' for a database without the function, 'failed' otherwise", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await requestBoot(1)).toEqual({ kind: "unsupported" });
    expect(await freshBoot(2)).toBeNull();
    invalidateBoot();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await requestBoot(1)).kind).toBe("failed");
    invalidateBoot();
    rpc.mockRejectedValueOnce(new Error("offline"));
    expect((await requestBoot(1)).kind).toBe("failed");
  });
});
