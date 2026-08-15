import { describe, expect, it } from "vitest";
import { bookingTypeForCategory, normalizeUrl } from "./placeOptions";

// normalizeUrl carried over from lib/data/links.ts, which place_options
// replaces — people paste "booking.com/x" as often as a full URL.
describe("normalizeUrl", () => {
  it("leaves an absolute http(s) url alone", () => {
    expect(normalizeUrl("https://booking.com/x")).toBe("https://booking.com/x");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("adds https:// to a bare host", () => {
    expect(normalizeUrl("booking.com/x")).toBe("https://booking.com/x");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  booking.com  ")).toBe("https://booking.com");
  });

  it("returns empty for blank input, so the column stays null", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });

  it("is case-insensitive about an existing scheme", () => {
    expect(normalizeUrl("HTTPS://booking.com")).toBe("HTTPS://booking.com");
  });
});

// The bank's categories are free text; bookings.type is a PG enum. Anything
// the enum can't express has to land on 'other' rather than fail the insert.
describe("bookingTypeForCategory", () => {
  it("maps the categories the bookings enum shares", () => {
    expect(bookingTypeForCategory("hotel")).toBe("hotel");
    expect(bookingTypeForCategory("attraction")).toBe("attraction");
    expect(bookingTypeForCategory("activity")).toBe("attraction");
    expect(bookingTypeForCategory("transport")).toBe("train");
  });

  it("falls back to 'other' for categories the enum has no slot for", () => {
    expect(bookingTypeForCategory("restaurant")).toBe("other");
    expect(bookingTypeForCategory("shop")).toBe("other");
    expect(bookingTypeForCategory("other")).toBe("other");
  });

  it("falls back to 'other' for an unset or invented category", () => {
    expect(bookingTypeForCategory(null)).toBe("other");
    expect(bookingTypeForCategory("סנורקלינג")).toBe("other");
  });
});
