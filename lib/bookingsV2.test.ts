import { describe, expect, it } from "vitest";
import { bookingFacts, countByType } from "./bookingsV2";
import type { Booking } from "@/lib/types";

describe("bookings v2 helpers (Phase 2.1)", () => {
  it("counts live bookings by type in display order", () => {
    const list = [
      { type: "hotel", status: "booked" },
      { type: "flight", status: "paid" },
      { type: "hotel", status: "paid" },
      { type: "hotel", status: "cancelled" },
      { type: "other", status: "booked" },
    ] as Pick<Booking, "type" | "status">[];
    expect(countByType(list)).toEqual([
      { type: "flight", count: 1 },
      { type: "hotel", count: 2 },
      { type: "other", count: 1 },
    ]);
  });

  it("reads travel times, stay times and flight facts from details defensively", () => {
    expect(bookingFacts({ type: "flight", details: { departure_time: "23:40", arrival_time: "17:05", flight_number: "VN 6013", terminal: "3", gate: " " } })).toMatchObject({
      from: "23:40",
      to: "17:05",
      timesKind: "travel",
      flightNumber: "VN 6013",
      terminal: "3",
      gate: null,
    });
    expect(bookingFacts({ type: "hotel", details: { check_in: "14:00" } })).toMatchObject({ from: "14:00", to: null, timesKind: "stay" });
    expect(bookingFacts({ type: "train", details: null }).timesKind).toBeNull();
    expect(bookingFacts({ type: "flight", details: [1, 2] as unknown as Booking["details"] }).from).toBeNull();
  });
});
