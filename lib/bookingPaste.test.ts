import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
const { pasteToInsert } = await import("@/lib/data/bookingPaste");

const base = {
  type: "flight" as const,
  title: "Tel Aviv - Hanoi",
  start_date: "2026-10-31",
  end_date: null,
  start_time: "23:40",
  end_time: "17:05",
  confirmation_code: "ABC123",
  cost: 4800,
  currency: "USD",
  provider: "Vietnam Airlines",
  flight_number: "VN 6013",
  terminal: "3",
  address: null,
  notes: null,
  confidence: { title: 0.95 },
};

describe("paste → booking row (Phase 2.1)", () => {
  it("maps a flight with departure/arrival times into details", () => {
    const row = pasteToInsert("t1", base);
    expect(row).toMatchObject({ trip_id: "t1", type: "flight", title: "Tel Aviv - Hanoi", status: "booked", cost: 4800, currency: "USD" });
    expect(row.details).toMatchObject({ source: "paste", departure_time: "23:40", arrival_time: "17:05", flight_number: "VN 6013", terminal: "3", provider: "Vietnam Airlines" });
  });

  it("uses check_in/check_out for hotels, like the booking form", () => {
    const row = pasteToInsert("t1", { ...base, type: "hotel", start_time: "14:00", end_time: "11:00", flight_number: null, terminal: null });
    expect(row.details).toMatchObject({ check_in: "14:00", check_out: "11:00" });
    expect(row.details).not.toHaveProperty("departure_time");
  });

  it("defaults the currency only when there is a price", () => {
    expect(pasteToInsert("t1", { ...base, currency: null }).currency).toBe("ILS");
    expect(pasteToInsert("t1", { ...base, cost: null, currency: "USD" }).currency).toBeNull();
  });
});
