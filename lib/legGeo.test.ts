import { describe, expect, it } from "vitest";
import { boundsOfPoints, legPoint } from "./legGeo";
import type { OptionForAreas } from "./data/segments";

function opts(
  rows: [area: string, n: number, lat: number | null, lng: number | null][],
  countryCode = "JP"
): OptionForAreas[] {
  return rows.flatMap(([area, n, lat, lng]) =>
    Array.from({ length: n }, () => ({
      country_code: countryCode,
      area,
      status: "option",
      lat,
      lng,
    }))
  );
}

describe("legPoint", () => {
  it("sits on the town the label names", () => {
    const point = legPoint(
      { countryCode: "JP", locationName: "קיוטו" },
      opts([
        ["קיוטו", 29, 35.006, 135.761],
        ["טוקיו", 44, 35.677, 139.756],
      ])
    );
    // closeTo, not toEqual: the area centre is a mean of 29 identical values,
    // so it comes back a float epsilon off the number that went in.
    expect(point?.lat).toBeCloseTo(35.006, 6);
    expect(point?.lng).toBeCloseTo(135.761, 6);
    expect(point?.precision).toBe("area");
    expect(point?.anchorArea).toBe("קיוטו");
  });

  it("picks the busiest of the leg's own areas, not the country's busiest", () => {
    // Tokyo has more ideas, but the label is Kyoto's, so Tokyo is not the
    // anchor even though it sorts first nationally.
    const point = legPoint(
      { countryCode: "JP", locationName: "קיוטו" },
      opts([
        ["טוקיו", 44, 35.677, 139.756],
        ["קיוטו", 29, 35.006, 135.761],
      ])
    );
    expect(point?.anchorArea).toBe("קיוטו");
  });

  it("falls back to the country centre, marked approximate, when the label matches nothing", () => {
    const point = legPoint(
      { countryCode: "JP", locationName: "האקונה" },
      opts([
        ["קיוטו", 29, 35.0, 135.0],
        ["טוקיו", 44, 37.0, 139.0],
      ])
    );
    expect(point?.precision).toBe("country");
    expect(point?.anchorArea).toBeNull();
    // Mean of the two area centres, not either one of them.
    expect(point?.lat).toBeCloseTo(36.0, 5);
    expect(point?.lng).toBeCloseTo(137.0, 5);
  });

  it("falls back to the country when the named town has no coordinates", () => {
    const point = legPoint(
      { countryCode: "JP", locationName: "קיוטו" },
      opts([
        ["קיוטו", 29, null, null],
        ["טוקיו", 44, 35.677, 139.756],
      ])
    );
    expect(point?.precision).toBe("country");
  });

  it("skips an ungeocoded area in favour of a smaller geocoded one", () => {
    // The label names both; only one can be drawn.
    const point = legPoint(
      { countryCode: "JP", locationName: "קיוטו נארה" },
      opts([
        ["קיוטו", 29, null, null],
        ["נארה", 8, 34.687, 135.841],
      ])
    );
    expect(point?.precision).toBe("area");
    expect(point?.anchorArea).toBe("נארה");
  });

  it("gives no point at all when the country has nothing geocoded", () => {
    const point = legPoint(
      { countryCode: "GE", locationName: "גאורגיה" },
      opts([["קיוטו", 29, 35.006, 135.761]])
    );
    expect(point).toBeNull();
  });

  it("gives no point for a leg with no country", () => {
    expect(
      legPoint({ countryCode: null, locationName: "אי שם" }, opts([["קיוטו", 1, 1, 1]]))
    ).toBeNull();
  });

  it("ignores ideas already decided", () => {
    const rows: OptionForAreas[] = [
      { country_code: "JP", area: "קיוטו", status: "booked", lat: 35, lng: 135 },
      { country_code: "JP", area: "קיוטו", status: "rejected", lat: 35, lng: 135 },
    ];
    expect(legPoint({ countryCode: "JP", locationName: "קיוטו" }, rows)).toBeNull();
  });

  it("does not borrow another country's coordinates", () => {
    const rows = [
      ...opts([["קיוטו", 5, 35.0, 135.0]], "JP"),
      ...opts([["בנגקוק", 5, 13.7, 100.5]], "TH"),
    ];
    const point = legPoint({ countryCode: "TH", locationName: "בנגקוק" }, rows);
    expect(point?.lat).toBeCloseTo(13.7, 5);
  });
});

describe("legPoint, a leg the family placed themselves", () => {
  it("prefers a coordinate already on the days over anything derived", () => {
    const point = legPoint(
      {
        countryCode: "JP",
        locationName: "האקונה",
        days: [
          { lat: null, lng: null },
          { lat: 35.232, lng: 139.107 },
        ],
      },
      // Tokyo is 75km away: close enough to believe, and the name to use.
      opts([["טוקיו", 44, 35.677, 139.756]])
    );
    expect(point?.lat).toBeCloseTo(35.232, 5);
    expect(point?.lng).toBeCloseTo(139.107, 5);
    expect(point?.precision).toBe("saved");
    expect(point?.anchorArea).toBe("טוקיו");
  });

  it("ignores a saved coordinate that is nowhere near the leg", () => {
    // The real case: this trip's first two days carried the geographic centre
    // of Vietnam, 780km south of Hanoi, left by the old geocoder. The leg is
    // northern Vietnam, so the point is rejected and Hanoi is derived instead.
    const point = legPoint(
      {
        countryCode: "VN",
        locationName: "וייטנאם - צפון",
        days: [{ lat: 14.058324, lng: 108.277199 }],
      },
      // A southern area is in the fixture on purpose. The "צפון" rule cuts the
      // country's own geocoded span into three bands, so without one the span
      // is only the northern towns and the band lands above Hanoi - which is
      // not how the real bank, spanning Saigon to Ha Giang, behaves.
      opts(
        [
          ["האנוי", 46, 21.029, 105.84],
          ["טאם קוק", 33, 20.217, 105.936],
          ["סאפה", 30, 21.592, 104.313],
          ["סייגון", 26, 10.78, 106.669],
        ],
        "VN"
      )
    );
    expect(point?.precision).toBe("area");
    expect(point?.anchorArea).toBe("האנוי");
    expect(point?.lat).toBeCloseTo(21.029, 3);
  });

  it("keeps a saved coordinate that sits right on one of the leg's areas", () => {
    const point = legPoint(
      {
        countryCode: "VN",
        locationName: "וייטנאם - צפון",
        days: [{ lat: 21.03, lng: 105.84 }],
      },
      opts([["האנוי", 46, 21.029, 105.84]], "VN")
    );
    expect(point?.precision).toBe("saved");
    expect(point?.anchorArea).toBe("האנוי");
  });

  it("trusts a saved coordinate when there is nothing geocoded to doubt it with", () => {
    const point = legPoint(
      { countryCode: "GE", locationName: "גאורגיה", days: [{ lat: 41.7, lng: 44.8 }] },
      []
    );
    expect(point?.precision).toBe("saved");
    expect(point?.anchorArea).toBe("גאורגיה");
  });

  it("still derives when the days carry no coordinate", () => {
    const point = legPoint(
      { countryCode: "JP", locationName: "קיוטו", days: [{ lat: null, lng: null }] },
      opts([["קיוטו", 5, 35.006, 135.761]])
    );
    expect(point?.precision).toBe("area");
  });
});

describe("boundsOfPoints", () => {
  it("wraps every point", () => {
    expect(
      boundsOfPoints([
        { lat: 10, lng: 100 },
        { lat: 40, lng: 140 },
        { lat: 20, lng: 90 },
      ])
    ).toEqual({ north: 40, south: 10, east: 140, west: 90 });
  });

  it("is null with nothing to fit", () => {
    expect(boundsOfPoints([])).toBeNull();
  });
});
