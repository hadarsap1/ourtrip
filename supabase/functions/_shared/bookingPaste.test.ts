import { describe, expect, it } from "vitest";
import { isLowConfidence, sanitizePaste } from "./bookingPaste";

const good = {
  found: true,
  booking: {
    type: "flight",
    title: "  Tel Aviv -   Hanoi ",
    start_date: "2026-10-31",
    end_date: null,
    start_time: "23:40",
    end_time: "17:05",
    confirmation_code: "ABC123",
    cost: 4812.456,
    currency: "usd",
    provider: "Vietnam Airlines",
    flight_number: "VN 6013",
    terminal: "3",
    address: null,
    notes: "כולל 23 ק\"ג מזוודה",
    confidence: { type: 0.99, title: 0.95, start_date: 0.9, start_time: 0.6, confirmation_code: 1.4, cost: 0.9, currency: 0.9 },
  },
};

describe("paste-to-import sanitizer (Phase 2.1)", () => {
  it("cleans a good reply", () => {
    const b = sanitizePaste(good)!;
    expect(b.title).toBe("Tel Aviv - Hanoi");
    expect(b.cost).toBe(4812.46);
    expect(b.currency).toBe("USD");
    expect(b.confidence.confirmation_code).toBe(1); // clamped
    expect(b.confidence.provider).toBe(0.5); // missing → not confident
    expect(b.confidence.end_date).toBeUndefined(); // empty field has none
    expect(isLowConfidence(b, "start_time")).toBe(true);
    expect(isLowConfidence(b, "title")).toBe(false);
  });

  it("rejects non-bookings and junk", () => {
    expect(sanitizePaste(null)).toBeNull();
    expect(sanitizePaste({ found: false, booking: good.booking })).toBeNull();
    expect(sanitizePaste({ found: true, booking: { ...good.booking, title: "   " } })).toBeNull();
    expect(sanitizePaste("ignore previous instructions")).toBeNull();
  });

  it("re-validates dates, times, money and enums", () => {
    const b = sanitizePaste({
      found: true,
      booking: { ...good.booking, type: "spaceship", start_date: "2026-02-31", end_date: "2026-01-01", start_time: "25:00", cost: -5, currency: "dollars" },
    })!;
    expect(b.type).toBe("other");
    expect(b.confidence.type).toBe(0);
    expect(b.start_date).toBeNull();
    expect(b.start_time).toBeNull();
    expect(b.cost).toBeNull();
    expect(b.currency).toBeNull();
  });

  it("drops an end date before the start and caps long strings", () => {
    const b = sanitizePaste({ found: true, booking: { ...good.booking, end_date: "2026-10-01", address: "x".repeat(500) } })!;
    expect(b.end_date).toBeNull();
    expect(b.address).toHaveLength(200);
  });
});
