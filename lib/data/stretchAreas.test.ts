import { describe, expect, it } from "vitest";
import { areaChoicesForStretch } from "./segments";
import type { PlaceOption } from "@/lib/types";

/** Builds N options for one area at one point, so an area's weight and its
 *  mean position are both realistic. */
const area = (
  name: string,
  lat: number | null,
  lng: number | null,
  n = 3,
  countryCode = "VN"
): PlaceOption[] =>
  Array.from(
    { length: n },
    (_, i) =>
      ({
        id: `${name}-${i}`,
        status: "option",
        country_code: countryCode,
        area: name,
        lat,
        lng,
      }) as PlaceOption
  );

/**
 * The real Vietnamese bank, area by area, at the mean coordinates read live
 * from the trip. The two Vietnam stretches are the whole reason this exists:
 * both were offering all of these.
 */
const VIETNAM: PlaceOption[] = [
  // north
  ...area("הא ג'יאנג", 23.09, 105.25, 4),
  ...area("קאו בנג", 22.78, 106.5, 4),
  ...area("סאפה", 21.59, 104.31, 26),
  ...area("האנוי", 21.03, 105.84, 47),
  ...area("הא לונג ביי", 20.91, 107.18, 2),
  ...area("קאט בא", 20.81, 107.07, 16),
  ...area("מאי צ׳או", 20.67, 105.07, 12),
  ...area("טאם קוק", 20.22, 105.94, 33),
  // centre
  ...area("פונג נה", 17.53, 106.28, 22),
  ...area("הואה", 16.43, 107.57, 17),
  ...area("דה נאנג", 16.06, 108.2, 15),
  ...area("הוי אן", 15.73, 108.26, 58),
  // south
  ...area("קון טום", 14.34, 108.04, 3),
  ...area("דה לאט", 11.95, 108.44, 30),
  ...area("סייגון", 10.78, 106.67, 26),
  ...area("דלתת המקונג", 10.24, 106.33, 13),
];

const names = (choices: { area: string }[]) => choices.map((c) => c.area);

describe("areaChoicesForStretch - a region in the label", () => {
  const north = areaChoicesForStretch(VIETNAM, {
    countryCode: "VN",
    locationName: "וייטנאם - צפון",
  });
  const southCentre = areaChoicesForStretch(VIETNAM, {
    countryCode: "VN",
    locationName: "וייטנאם - דרום ומרכז",
  });

  it("reports that it filtered by region", () => {
    expect(north.rule).toBe("region");
    expect(southCentre.rule).toBe("region");
  });

  it("keeps Saigon out of the northern leg", () => {
    // The bug as reported: Saigon, Da Lat and Hoi An listed under "צפון".
    expect(names(north.matched)).not.toContain("סייגון");
    expect(names(north.matched)).not.toContain("דה לאט");
    expect(names(north.matched)).not.toContain("הוי אן");
  });

  it("offers exactly the northern towns under the northern leg", () => {
    expect(names(north.matched).sort()).toEqual(
      [
        "האנוי",
        "הא ג'יאנג",
        "הא לונג ביי",
        "טאם קוק",
        "מאי צ׳או",
        "סאפה",
        "קאו בנג",
        "קאט בא",
      ].sort()
    );
  });

  it("keeps Hanoi out of the southern leg", () => {
    expect(names(southCentre.matched)).not.toContain("האנוי");
    expect(names(southCentre.matched)).not.toContain("סאפה");
    expect(names(southCentre.matched)).not.toContain("טאם קוק");
  });

  it("gives the southern leg both of the bands its label names", () => {
    // "דרום ומרכז" is two thirds of the country, so it gets both.
    expect(names(southCentre.matched)).toEqual(
      expect.arrayContaining([
        "הוי אן",
        "הואה",
        "דה נאנג",
        "פונג נה",
        "סייגון",
        "דה לאט",
        "דלתת המקונג",
      ])
    );
  });

  it("puts everything it excluded within one tap", () => {
    // Nothing is destroyed by a filter - `rest` is the "all towns" toggle.
    expect([...names(north.matched), ...names(north.rest)].sort()).toEqual(
      names(areaChoicesForStretch(VIETNAM, { countryCode: "VN", locationName: null }).matched).sort()
    );
    expect(north.rest.length).toBeGreaterThan(0);
  });

  it("splits the two legs into complementary halves", () => {
    for (const name of names(north.matched)) {
      expect(names(southCentre.matched)).not.toContain(name);
    }
  });

  it("still offers an area with no coordinates, having no evidence against it", () => {
    const withUnlocated = [...VIETNAM, ...area("פו לונג", null, null, 1)];
    const result = areaChoicesForStretch(withUnlocated, {
      countryCode: "VN",
      locationName: "וייטנאם - צפון",
    });
    expect(names(result.matched)).toContain("פו לונג");
  });
});

describe("areaChoicesForStretch - towns in the label", () => {
  const JAPAN: PlaceOption[] = [
    ...area("טוקיו", 35.68, 139.69, 43, "JP"),
    ...area("קיוטו", 35.01, 135.77, 29, "JP"),
    ...area("נארה", 34.69, 135.8, 8, "JP"),
    ...area("אוסקה", 34.69, 135.5, 11, "JP"),
    ...area("הוקאידו", 43.06, 141.35, 24, "JP"),
  ];

  it("puts the named town first and keeps the rest reachable", () => {
    const kyoto = areaChoicesForStretch(JAPAN, {
      countryCode: "JP",
      locationName: "קיוטו",
    });
    expect(kyoto.rule).toBe("towns");
    expect(kyoto.matched[0].area).toBe("קיוטו");
    // A town label is a base, not a region claim: Nara is 30 minutes away and
    // must stay on the list, so nothing is hidden.
    expect(kyoto.rest).toHaveLength(0);
    expect(names(kyoto.matched)).toContain("נארה");
  });

  it("orders the rest by distance from the named town", () => {
    const kyoto = areaChoicesForStretch(JAPAN, {
      countryCode: "JP",
      locationName: "קיוטו",
    });
    // Nara and Osaka are next door; Hokkaido is 1000km away and sorts last
    // despite having three times Nara's options.
    expect(names(kyoto.matched).indexOf("נארה")).toBeLessThan(
      names(kyoto.matched).indexOf("הוקאידו")
    );
    expect(names(kyoto.matched).at(-1)).toBe("הוקאידו");
  });

  it("reads a label that names two towns", () => {
    const pair = areaChoicesForStretch(JAPAN, {
      countryCode: "JP",
      locationName: "טוקיו ואוסקה",
    });
    expect(pair.matched.slice(0, 2).map((c) => c.area).sort()).toEqual(
      ["אוסקה", "טוקיו"].sort()
    );
  });
});

describe("areaChoicesForStretch - nothing to go on", () => {
  it("offers the whole country when the label names neither", () => {
    const thailand = [
      ...area("צ'אנג מאי", 18.79, 98.99, 52, "TH"),
      ...area("קו לנטה", 7.63, 99.05, 25, "TH"),
      ...area("בנגקוק", 13.76, 100.5, 10, "TH"),
    ];
    const result = areaChoicesForStretch(thailand, {
      countryCode: "TH",
      locationName: "תאילנד",
    });
    expect(result.rule).toBe("country");
    expect(result.matched).toHaveLength(3);
    expect(result.rest).toHaveLength(0);
  });

  it("offers the whole country when the label has no text at all", () => {
    const result = areaChoicesForStretch(VIETNAM, {
      countryCode: "VN",
      locationName: null,
    });
    expect(result.rule).toBe("country");
    expect(result.rest).toHaveLength(0);
  });

  it("does not filter when a region word would exclude everything", () => {
    // One town, so every band it is not in is empty. A toggle revealing an
    // empty list, or a list hiding the only town, helps nobody.
    const single = area("האנוי", 21.03, 105.84, 5);
    const result = areaChoicesForStretch(single, {
      countryCode: "VN",
      locationName: "וייטנאם - דרום",
    });
    expect(result.rule).toBe("country");
    expect(names(result.matched)).toEqual(["האנוי"]);
  });

  it("ignores options from other countries", () => {
    const mixed = [...VIETNAM, ...area("בנגקוק", 13.76, 100.5, 10, "TH")];
    const result = areaChoicesForStretch(mixed, {
      countryCode: "VN",
      locationName: "וייטנאם - צפון",
    });
    expect([...names(result.matched), ...names(result.rest)]).not.toContain(
      "בנגקוק"
    );
  });
});
