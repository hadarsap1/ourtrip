import { describe, expect, it } from "vitest";
import {
  boundsOf,
  bookingTypeForCategory,
  filterOptions,
  groupForDay,
  mapsSearchUrl,
  normalizeUrl,
  PLACE_CATEGORIES,
  tallyByArea,
} from "./placeOptions";
import { strings } from "@/lib/strings";
import type { PlaceOption } from "@/lib/types";

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

// The list and the map share one filter on purpose: a pin the list doesn't
// show, or vice versa, would be a lie about what's in the bank.
describe("filterOptions", () => {
  const opt = (over: Partial<PlaceOption>): PlaceOption =>
    ({
      id: crypto.randomUUID(),
      trip_id: "t",
      title: "x",
      category: "restaurant",
      country: "וייטנאם",
      country_code: null,
      area: "הוי אן",
      note: null,
      source: "facebook",
      source_url: null,
      booking_url: null,
      location_name: null,
      lat: 15.88,
      lng: 108.33,
      place_id: null,
      maps_url: null,
      status: "option",
      booking_id: null,
      created_by: null,
      created_at: "",
      updated_at: "",
      ...over,
    }) as PlaceOption;

  const bank = [
    opt({ title: "מסעדה בהוי אן" }),
    opt({ title: "מלון בהוי אן", category: "hotel", status: "shortlist" }),
    opt({ title: "מסעדה בהואה", area: "הואה" }),
    opt({ title: "פארק בלאוס", country: "לאוס", area: "לואנג פראבנג", category: "nature" }),
    opt({ title: "בלי מיקום", lat: null, lng: null }),
  ];

  it("returns everything when no cut is set", () => {
    expect(filterOptions(bank, {})).toHaveLength(5);
  });

  it("cuts by category, status, country and area independently", () => {
    expect(filterOptions(bank, { category: "hotel" })).toHaveLength(1);
    expect(filterOptions(bank, { status: "shortlist" })).toHaveLength(1);
    expect(filterOptions(bank, { country: "לאוס" })).toHaveLength(1);
    expect(filterOptions(bank, { area: "הואה" })).toHaveLength(1);
  });

  it("composes cuts — they narrow, never widen", () => {
    const cut = filterOptions(bank, { country: "וייטנאם", area: "הוי אן" });
    expect(cut.map((o) => o.title)).toEqual([
      "מסעדה בהוי אן",
      "מלון בהוי אן",
      "בלי מיקום",
    ]);
    expect(
      filterOptions(bank, { country: "וייטנאם", area: "הוי אן", category: "hotel" })
    ).toHaveLength(1);
  });

  it("matches country and area regardless of case and stray spaces", () => {
    // These are free text a person types twice; "  הוי אן " must not be a
    // different place from "הוי אן".
    expect(filterOptions(bank, { area: "  הוי אן  " })).toHaveLength(3);
  });

  it("drops unlocated options only when the map asks", () => {
    expect(filterOptions(bank, { locatedOnly: true })).toHaveLength(4);
    expect(filterOptions(bank, {})).toHaveLength(5);
  });

  it("returns empty rather than everything when a cut matches nothing", () => {
    expect(filterOptions(bank, { country: "תאילנד" })).toEqual([]);
  });
});

describe("boundsOf", () => {
  const at = (lat: number | null, lng: number | null) =>
    ({ lat, lng }) as PlaceOption;

  it("spans every located option", () => {
    expect(boundsOf([at(10, 100), at(20, 110), at(15, 105)])).toEqual({
      north: 20,
      south: 10,
      east: 110,
      west: 100,
    });
  });

  it("ignores options with no coordinates", () => {
    expect(boundsOf([at(10, 100), at(null, null), at(20, 110)])).toEqual({
      north: 20,
      south: 10,
      east: 110,
      west: 100,
    });
  });

  it("is null when nothing can be placed", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([at(null, null)])).toBeNull();
  });
});

// The per-area tally is what turns "ויטנאם (249)" into something a person can
// act on, so the matching rules it depends on are worth pinning down.
describe("tallyByArea", () => {
  const option = (area: string | null, status = "option"): PlaceOption =>
    ({ area, status }) as PlaceOption;

  it("counts options and planned ones per area", () => {
    const t = tallyByArea(
      [
        option("הוי אן"),
        option("הוי אן", "planned"),
        option("האנוי"),
      ],
      []
    );
    expect(t.get("הוי אן")).toEqual({ days: 0, options: 2, planned: 1 });
    expect(t.get("האנוי")).toEqual({ days: 0, options: 1, planned: 0 });
  });

  it("matches itinerary days to the area by name, ignoring case and padding", () => {
    const t = tallyByArea(
      [option("Hoi An")],
      [{ location_name: " hoi an " }, { location_name: "HOI AN" }]
    );
    expect(t.get("hoi an")?.days).toBe(2);
  });

  it("ignores options with no area rather than inventing a bucket", () => {
    const t = tallyByArea([option(null), option("  ")], []);
    expect(t.size).toBe(0);
  });

  it("reports zero days for an area the itinerary never visits", () => {
    const t = tallyByArea([option("סאפה")], [{ location_name: "האנוי" }]);
    expect(t.get("סאפה")?.days).toBe(0);
  });
});

// Rejecting used to be almost invisible: the row kept its pin and kept counting
// toward "N places have no location", so the only action available for the rows
// that are not places at all never cleared them.
describe("filterOptions excludeRejected", () => {
  const opt = (status: string, title = "x"): PlaceOption =>
    ({ status, title }) as PlaceOption;

  it("drops rejected options when asked", () => {
    const rows = [opt("option"), opt("rejected"), opt("planned")];
    expect(filterOptions(rows, { excludeRejected: true })).toHaveLength(2);
  });

  it("keeps them when the reader is looking at the rejected pile", () => {
    const rows = [opt("option"), opt("rejected")];
    expect(filterOptions(rows, { status: "rejected" })).toEqual([rows[1]]);
  });

  it("leaves every other status alone", () => {
    const rows = [opt("option"), opt("shortlist"), opt("planned"), opt("booked")];
    expect(filterOptions(rows, { excludeRejected: true })).toHaveLength(4);
  });
});

// The picker's ordering has to work with the data this trip actually has: no
// day carries coordinates, and the days are long stretches ("תאילנד", 38 days)
// rather than towns. Distance ranking is therefore dead and grouping carries
// the whole load.
describe("groupForDay", () => {
  const opt = (title: string, area: string | null): PlaceOption =>
    ({ id: title, title, area, status: "option", lat: null, lng: null }) as PlaceOption;
  const stretch = { location_name: "תאילנד", lat: null, lng: null };

  it("puts the biggest area first when nothing matches the stretch", () => {
    const groups = groupForDay(
      [opt("a", "הואה הין"), opt("b", "צ'אנג מאי"), opt("c", "הואה הין")],
      stretch
    );
    expect(groups[0].area).toBe("הואה הין");
    expect(groups[0].options).toHaveLength(2);
  });

  it("puts the stretch's own area first even when it is smaller", () => {
    const groups = groupForDay(
      [opt("a", "בנגקוק"), opt("b", "בנגקוק"), opt("c", "תאילנד")],
      stretch
    );
    expect(groups[0].area).toBe("תאילנד");
  });

  it("sinks the options with no area to the bottom", () => {
    const groups = groupForDay(
      [opt("a", null), opt("b", null), opt("c", null), opt("d", "הואה הין")],
      stretch
    );
    expect(groups[groups.length - 1].area).toBeNull();
  });

  it("keeps every option exactly once", () => {
    const rows = [opt("a", "x"), opt("b", null), opt("c", "y"), opt("d", "x")];
    const groups = groupForDay(rows, stretch);
    expect(groups.flatMap((g) => g.options)).toHaveLength(rows.length);
  });
});
