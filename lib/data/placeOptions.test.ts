import { describe, expect, it } from "vitest";
import {
  bookingTypeForCategory,
  mapsSearchUrl,
  normalizeUrl,
  PLACE_CATEGORIES,
} from "./placeOptions";
import { strings } from "@/lib/strings";

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

  // city/nature exist for destination guides. You don't "book" a town or a
  // national park as a booking type, so they land on 'other' by design.
  it("books a city or a park as 'other'", () => {
    expect(bookingTypeForCategory("city")).toBe("other");
    expect(bookingTypeForCategory("nature")).toBe("other");
  });
});

// Guarding the client/function contract: the Edge Function pins `category` to
// an enum, so a value only one side knows about is silently rewritten to
// "other". These are the categories both sides must agree on.
describe("PLACE_CATEGORIES", () => {
  it("carries the destination-guide categories, not just business types", () => {
    expect(PLACE_CATEGORIES).toContain("city");
    expect(PLACE_CATEGORIES).toContain("nature");
  });

  it("has a Hebrew label for every category", () => {
    for (const category of PLACE_CATEGORIES) {
      expect(strings.options.categories[category]).toBeTruthy();
    }
  });
});

// Every extracted place gets a way to be found on a map, even when the post
// named no link at all — that was the point of adding it.
describe("mapsSearchUrl", () => {
  const q = (url: string | null) =>
    decodeURIComponent(new URL(url!).searchParams.get("query")!);

  it("combines name, area and country into one search", () => {
    expect(q(mapsSearchUrl("Roving Chill House", "הוי אן", "וייטנאם"))).toBe(
      "Roving Chill House הוי אן וייטנאם"
    );
  });

  it("works from the name alone", () => {
    expect(q(mapsSearchUrl("Slow Cafe"))).toBe("Slow Cafe");
  });

  it("skips missing or blank parts rather than leaving gaps", () => {
    expect(q(mapsSearchUrl("Slow Cafe", null, "וייטנאם"))).toBe("Slow Cafe וייטנאם");
    expect(q(mapsSearchUrl("Slow Cafe", "   ", null))).toBe("Slow Cafe");
  });

  it("escapes characters that would otherwise break the query string", () => {
    const url = mapsSearchUrl("Bánh Mì Phượng & Co", "Hội An")!;
    expect(url).toContain("%26"); // the & is encoded, not a second param
    expect(new URL(url).searchParams.get("query")).toBe("Bánh Mì Phượng & Co Hội An");
  });

  it("returns null when there is nothing to search for", () => {
    expect(mapsSearchUrl("")).toBeNull();
    expect(mapsSearchUrl("  ", "  ")).toBeNull();
  });
});
