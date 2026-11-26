import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ rpc }),
  onSignedOut: () => {},
}));

const { parseHome, requestHome, invalidateHome, weekStart, HOME_FRESH_MS } = await import("./homeRpc");

describe("parseHome", () => {
  it("reads the function's answer", () => {
    const home = parseHome({
      trip_id: "t1",
      categories: [{ id: "c" }],
      total_budget: 180000,
      expenses: [{ id: "e", amount_ils: 10 }],
      photos_today: [],
      parents: [{ id: "p", name: "א" }],
      steps_from: "2026-10-31",
      steps: [{ member_id: "p", date: "2026-11-24", steps: 9000 }],
    });
    expect(home?.tripId).toBe("t1");
    expect(home?.totalBudget).toBe(180000);
    expect(home?.stepsFrom).toBe("2026-10-31");
    expect(home?.steps).toHaveLength(1);
  });

  it("no active trip, or anything unexpected, is null", () => {
    expect(parseHome({ trip_id: null })).toBeNull();
    expect(parseHome(null)).toBeNull();
    expect(parseHome("x")).toBeNull();
  });

  it("a missing list reads as empty, a missing total as none", () => {
    const home = parseHome({ trip_id: "t1" });
    expect(home?.expenses).toEqual([]);
    expect(home?.totalBudget).toBeNull();
  });
});

describe("weekStart", () => {
  it("is six days before today", () => {
    expect(weekStart("2026-11-24")).toBe("2026-11-18");
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
  });
});

describe("requestHome", () => {
  beforeEach(() => {
    invalidateHome();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { trip_id: "t1" }, error: null });
  });

  it("serves loaders that ask together from one request", async () => {
    const now = 1_000_000;
    const [a, b] = await Promise.all([requestHome(now), requestHome(now + 100)]);
    expect(a?.tripId).toBe("t1");
    expect(b).toBe(a);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("asks again once the answer is no longer fresh", async () => {
    await requestHome(1_000_000);
    await requestHome(1_000_000 + HOME_FRESH_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("a failed call is null: the loaders fall back to their own queries", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "500", message: "x" } });
    expect(await requestHome(5_000_000)).toBeNull();
  });
});
