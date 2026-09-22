import { describe, expect, it } from "vitest";
import { buildLegOverviews, initialOpenLeg } from "./itineraryOverview";
import type {
  Booking,
  ItineraryDay,
  ItineraryItem,
  PlaceOption,
} from "./types";

function day(date: string, country: string | null, label: string | null): ItineraryDay {
  return {
    id: `d-${date}`,
    trip_id: "t1",
    date,
    country_code: country,
    location_name: label,
    lat: null,
    lng: null,
    notes: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function range(
  from: number,
  to: number,
  country: string | null,
  label: string | null
): ItineraryDay[] {
  const out: ItineraryDay[] = [];
  for (let d = from; d <= to; d += 1) {
    out.push(day(`2027-01-${String(d).padStart(2, "0")}`, country, label));
  }
  return out;
}

function item(dayId: string, status: ItineraryItem["status"] = "planned"): ItineraryItem {
  return {
    id: `i-${dayId}-${status}-${Math.random()}`,
    day_id: dayId,
    title: "x",
    status,
    sort_order: 0,
    start_time: null,
    end_time: null,
    location_name: null,
    lat: null,
    lng: null,
    place_id: null,
    notes: null,
    is_outdoor: false,
    shared_with_guests: false,
    booking_id: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: `b-${Math.random()}`,
    trip_id: "t1",
    type: "hotel",
    title: "stay",
    start_date: null,
    end_date: null,
    confirmation_code: null,
    cost: null,
    currency: null,
    status: "booked",
    file_path: null,
    link_url: null,
    details: {},
    notes: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function option(over: Partial<PlaceOption> = {}): PlaceOption {
  return {
    id: `o-${Math.random()}`,
    trip_id: "t1",
    country: null,
    country_code: "JP",
    area: "קיוטו",
    title: "x",
    category: null,
    note: null,
    source: "manual",
    source_url: null,
    booking_url: null,
    location_name: null,
    lat: null,
    lng: null,
    place_id: null,
    maps_url: null,
    status: "option",
    booking_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    geocode_attempts: 0,
    itinerary_item_id: null,
    area_original: null,
    country_original: null,
    ...over,
  };
}

describe("buildLegOverviews", () => {
  it("splits the days into legs and counts each one's span", () => {
    const days = [
      ...range(1, 3, "JP", "קיוטו"),
      ...range(4, 5, "JP", "אוסקה"),
    ];
    const legs = buildLegOverviews(days, [], [], [], "2026-01-01");
    expect(legs).toHaveLength(2);
    expect(legs[0].stretch.locationName).toBe("קיוטו");
    expect(legs[0].dayCount).toBe(3);
    expect(legs[1].dayCount).toBe(2);
  });

  it("counts a day as planned once, whether it has one item or three", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const items = [item("d-2027-01-01"), item("d-2027-01-01"), item("d-2027-01-02")];
    const [leg] = buildLegOverviews(days, items, [], [], "2026-01-01");
    expect(leg.items).toBe(3);
    expect(leg.daysPlanned).toBe(2);
  });

  it("does not let a cancelled activity make a day look planned", () => {
    const days = range(1, 2, "JP", "קיוטו");
    const [leg] = buildLegOverviews(days, [item("d-2027-01-01", "cancelled")], [], [], "2026-01-01");
    expect(leg.items).toBe(0);
    expect(leg.daysPlanned).toBe(0);
  });

  it("a booking fills every night it covers, not just its start", () => {
    const days = range(1, 5, "JP", "קיוטו");
    const stay = booking({ start_date: "2027-01-01", end_date: "2027-01-04" });
    const [leg] = buildLegOverviews(days, [], [stay], [], "2026-01-01");
    // check-in through the night before check-out: 1st, 2nd, 3rd.
    expect(leg.daysPlanned).toBe(3);
    expect(leg.hasStay).toBe(true);
    expect(leg.bookings).toBe(1);
  });

  it("files a booking under the leg it starts in, even when it crosses", () => {
    const days = [
      ...range(1, 3, "VN", "האנוי"),
      ...range(4, 6, "TH", "בנגקוק"),
    ];
    const flight = booking({ type: "flight", start_date: "2027-01-03", end_date: "2027-01-04" });
    const legs = buildLegOverviews(days, [], [flight], [], "2026-01-01");
    expect(legs[0].bookings).toBe(1);
    expect(legs[1].bookings).toBe(0);
    // It still fills the day it lands on.
    expect(legs[1].daysPlanned).toBe(1);
  });

  it("ignores a cancelled booking entirely", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const dead = booking({ start_date: "2027-01-01", end_date: "2027-01-03", status: "cancelled" });
    const [leg] = buildLegOverviews(days, [], [dead], [], "2026-01-01");
    expect(leg.bookings).toBe(0);
    expect(leg.daysPlanned).toBe(0);
    expect(leg.hasStay).toBe(false);
  });

  it("a booking outside the plan's dates claims no leg", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const stray = booking({ start_date: "2029-05-05" });
    const [leg] = buildLegOverviews(days, [], [stray], [], "2026-01-01");
    expect(leg.bookings).toBe(0);
  });

  it("scopes ideas to the towns the label names", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const options = [
      option({ area: "קיוטו" }),
      option({ area: "קיוטו" }),
      option({ area: "טוקיו" }),
      option({ area: "טוקיו" }),
      option({ area: "טוקיו" }),
    ];
    const [leg] = buildLegOverviews(days, [], [], options, "2026-01-01");
    // Tokyo's three are offered in the picker but are not Kyoto's count.
    expect(leg.ideas).toBe(2);
    expect(leg.ideaScope).toBe("area");
  });

  it("falls back to the country, and says so, when the label names nothing known", () => {
    const days = range(1, 3, "JP", "האקונה");
    const options = [option({ area: "קיוטו" }), option({ area: "טוקיו" })];
    const [leg] = buildLegOverviews(days, [], [], options, "2026-01-01");
    expect(leg.ideas).toBe(2);
    expect(leg.ideaScope).toBe("country");
  });

  it("counts only undecided ideas", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const options = [
      option({ area: "קיוטו", status: "option" }),
      option({ area: "קיוטו", status: "shortlist" }),
      option({ area: "קיוטו", status: "booked" }),
      option({ area: "קיוטו", status: "rejected" }),
      option({ area: "קיוטו", status: "planned" }),
    ];
    const [leg] = buildLegOverviews(days, [], [], options, "2026-01-01");
    expect(leg.ideas).toBe(2);
  });

  it("does not count another country's ideas", () => {
    const days = range(1, 3, "JP", "קיוטו");
    const options = [option({ area: "קיוטו" }), option({ country_code: "TH", area: "קיוטו" })];
    const [leg] = buildLegOverviews(days, [], [], options, "2026-01-01");
    expect(leg.ideas).toBe(1);
  });

  it("marks each leg past, current or future against today", () => {
    const days = [
      ...range(1, 3, "JP", "קיוטו"),
      ...range(4, 6, "JP", "אוסקה"),
      ...range(7, 9, "JP", "טוקיו"),
    ];
    const legs = buildLegOverviews(days, [], [], [], "2027-01-05");
    expect(legs.map((l) => l.phase)).toEqual(["past", "current", "future"]);
  });

  it("returns nothing for a trip with no days", () => {
    expect(buildLegOverviews([], [], [], [], "2027-01-01")).toEqual([]);
  });
});

describe("initialOpenLeg", () => {
  const days = [
    ...range(1, 3, "JP", "קיוטו"),
    ...range(4, 6, "JP", "אוסקה"),
    ...range(7, 9, "JP", "טוקיו"),
  ];

  it("opens the leg you are in", () => {
    const legs = buildLegOverviews(days, [], [], [], "2027-01-05");
    expect(initialOpenLeg(legs)).toBe(legs[1].key);
  });

  it("opens the first leg before the trip starts", () => {
    const legs = buildLegOverviews(days, [], [], [], "2026-09-22");
    expect(initialOpenLeg(legs)).toBe(legs[0].key);
  });

  it("opens the last leg once the trip is over", () => {
    const legs = buildLegOverviews(days, [], [], [], "2028-01-01");
    expect(initialOpenLeg(legs)).toBe(legs[2].key);
  });

  it("opens nothing when there are no legs", () => {
    expect(initialOpenLeg([])).toBeNull();
  });
});
