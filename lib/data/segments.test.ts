import { describe, expect, it } from "vitest";
import {
  areaChoicesForCountry,
  moveLeg,
  planLegs,
  splitIntoStretches,
  totalLegDays,
  type Leg,
  type Stretch,
} from "./segments";
import type { ItineraryDay, PlaceOption } from "@/lib/types";

const day = (
  date: string,
  country: string | null,
  location: string | null
): ItineraryDay =>
  ({ id: `d-${date}`, date, country_code: country, location_name: location }) as ItineraryDay;

const opt = (over: Partial<PlaceOption>): PlaceOption =>
  ({ status: "option", country_code: "VN", area: null, lat: null, lng: null, ...over }) as PlaceOption;

describe("splitIntoStretches", () => {
  it("groups consecutive days that share a country and a label", () => {
    const s = splitIntoStretches([
      day("2026-11-03", "VN", "וייטנאם - צפון"),
      day("2026-11-04", "VN", "וייטנאם - צפון"),
      day("2026-11-05", "TH", "תאילנד"),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0].days).toHaveLength(2);
    expect(s[0].from).toBe("2026-11-03");
    expect(s[0].to).toBe("2026-11-04");
    expect(s[1].countryCode).toBe("TH");
  });

  it("sorts by date first, so an out-of-order fetch still groups", () => {
    const s = splitIntoStretches([
      day("2026-11-05", "VN", "צפון"),
      day("2026-11-03", "VN", "צפון"),
      day("2026-11-04", "VN", "צפון"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].days.map((d) => d.date)).toEqual([
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
  });

  it("does NOT break on a gap in the dates - a hole is not a new place", () => {
    const s = splitIntoStretches([
      day("2026-11-03", "VN", "הוי אן"),
      day("2026-11-06", "VN", "הוי אן"),
    ]);
    expect(s).toHaveLength(1);
  });

  it("breaks when the label changes inside one country", () => {
    const s = splitIntoStretches([
      day("2026-11-03", "VN", "וייטנאם - צפון"),
      day("2026-11-04", "VN", "וייטנאם - דרום ומרכז"),
    ]);
    expect(s).toHaveLength(2);
  });

  it("treats a run of unlabelled days as one stretch", () => {
    const s = splitIntoStretches([
      day("2026-11-03", "VN", null),
      day("2026-11-04", "VN", null),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].locationName).toBeNull();
  });

  it("returns nothing for no days", () => {
    expect(splitIntoStretches([])).toEqual([]);
  });
});

describe("areaChoicesForCountry", () => {
  it("counts undecided options per area, richest first", () => {
    const choices = areaChoicesForCountry(
      [
        opt({ area: "הוי אן" }),
        opt({ area: "הוי אן" }),
        opt({ area: "האנוי" }),
      ],
      "VN"
    );
    expect(choices.map((c) => [c.area, c.options])).toEqual([
      ["הוי אן", 2],
      ["האנוי", 1],
    ]);
  });

  it("leaves out other countries", () => {
    const choices = areaChoicesForCountry(
      [opt({ area: "הוי אן", country_code: "VN" }), opt({ area: "טוקיו", country_code: "JP" })],
      "VN"
    );
    expect(choices.map((c) => c.area)).toEqual(["הוי אן"]);
  });

  it("leaves out planned, booked and rejected - nothing left to decide there", () => {
    const choices = areaChoicesForCountry(
      [
        opt({ area: "האנוי", status: "planned" }),
        opt({ area: "האנוי", status: "rejected" }),
        opt({ area: "האנוי", status: "booked" }),
        opt({ area: "האנוי", status: "shortlist" }),
      ],
      "VN"
    );
    expect(choices).toEqual([
      { area: "האנוי", options: 1, lat: null, lng: null },
    ]);
  });

  it("skips options with no area - that is not somewhere you can stay", () => {
    const choices = areaChoicesForCountry(
      [opt({ area: null }), opt({ area: "   " }), opt({ area: "סאפה" })],
      "VN"
    );
    expect(choices.map((c) => c.area)).toEqual(["סאפה"]);
  });

  it("averages only the geocoded options into the centroid", () => {
    const choices = areaChoicesForCountry(
      [
        opt({ area: "סאפה", lat: 10, lng: 100 }),
        opt({ area: "סאפה", lat: 20, lng: 200 }),
        opt({ area: "סאפה" }),
      ],
      "VN"
    );
    expect(choices[0].lat).toBe(15);
    expect(choices[0].lng).toBe(150);
  });

  it("has no centroid when nothing in the area is geocoded", () => {
    const choices = areaChoicesForCountry([opt({ area: "קון טום" })], "VN");
    expect(choices[0].lat).toBeNull();
    expect(choices[0].lng).toBeNull();
  });

  it("folds spellings that differ only in case into one area", () => {
    const choices = areaChoicesForCountry(
      [opt({ area: "Hoi An" }), opt({ area: "hoi an" })],
      "VN"
    );
    expect(choices).toHaveLength(1);
    expect(choices[0].options).toBe(2);
  });

  it("with no country given, takes the whole bank", () => {
    const choices = areaChoicesForCountry(
      [opt({ area: "הוי אן", country_code: "VN" }), opt({ area: "טוקיו", country_code: "JP" })],
      null
    );
    expect(choices).toHaveLength(2);
  });
});

describe("planLegs", () => {
  const stretch = (n: number): Stretch => {
    const days = Array.from({ length: n }, (_, i) =>
      day(`2026-11-${String(i + 3).padStart(2, "0")}`, "VN", "וייטנאם - צפון")
    );
    return {
      countryCode: "VN",
      locationName: "וייטנאם - צפון",
      days,
      from: days[0].date,
      to: days[days.length - 1].date,
    };
  };
  const leg = (area: string, days: number): Leg => ({ area, days, lat: null, lng: null });

  it("hands out days in order, consecutively", () => {
    const plan = planLegs(stretch(5), [leg("האנוי", 2), leg("סאפה", 3)]);
    expect(plan.assignments.map((a) => [a.day.date, a.locationName])).toEqual([
      ["2026-11-03", "האנוי"],
      ["2026-11-04", "האנוי"],
      ["2026-11-05", "סאפה"],
      ["2026-11-06", "סאפה"],
      ["2026-11-07", "סאפה"],
    ]);
    expect(plan.leftover).toEqual([]);
  });

  it("carries the area's coordinates onto its days", () => {
    const plan = planLegs(stretch(1), [
      { area: "סאפה", days: 1, lat: 22.3, lng: 103.8 },
    ]);
    expect(plan.assignments[0].lat).toBe(22.3);
    expect(plan.assignments[0].lng).toBe(103.8);
  });

  it("reports the days no leg claimed instead of blanking them", () => {
    const plan = planLegs(stretch(5), [leg("האנוי", 2)]);
    expect(plan.assignments).toHaveLength(2);
    expect(plan.leftover.map((d) => d.date)).toEqual([
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });

  it("stops at the end of the stretch when the legs ask for more", () => {
    const plan = planLegs(stretch(3), [leg("האנוי", 2), leg("סאפה", 5)]);
    expect(plan.assignments).toHaveLength(3);
    expect(plan.leftover).toEqual([]);
  });

  it("ignores legs resting at zero - that is how you say 'not this trip'", () => {
    const plan = planLegs(stretch(2), [leg("האנוי", 0), leg("סאפה", 2)]);
    expect(plan.assignments.every((a) => a.locationName === "סאפה")).toBe(true);
  });

  it("ignores a negative or fractional ask rather than throwing", () => {
    const plan = planLegs(stretch(3), [leg("האנוי", -2), leg("סאפה", 2.7)]);
    expect(plan.assignments.map((a) => a.locationName)).toEqual(["סאפה", "סאפה"]);
  });

  it("assigns nothing when there are no legs", () => {
    const plan = planLegs(stretch(3), []);
    expect(plan.assignments).toEqual([]);
    expect(plan.leftover).toHaveLength(3);
  });
});

describe("totalLegDays", () => {
  it("sums what the legs are asking for", () => {
    expect(
      totalLegDays([
        { area: "a", days: 2, lat: null, lng: null },
        { area: "b", days: 3, lat: null, lng: null },
      ])
    ).toBe(5);
  });

  it("floors fractions and ignores negatives", () => {
    expect(
      totalLegDays([
        { area: "a", days: 2.9, lat: null, lng: null },
        { area: "b", days: -4, lat: null, lng: null },
      ])
    ).toBe(2);
  });
});

describe("moveLeg", () => {
  const legs: Leg[] = [
    { area: "a", days: 1, lat: null, lng: null },
    { area: "b", days: 1, lat: null, lng: null },
    { area: "c", days: 1, lat: null, lng: null },
  ];

  it("swaps with the neighbour", () => {
    expect(moveLeg(legs, 0, 1).map((l) => l.area)).toEqual(["b", "a", "c"]);
    expect(moveLeg(legs, 2, -1).map((l) => l.area)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op off either end, so both buttons can stay wired", () => {
    expect(moveLeg(legs, 0, -1)).toBe(legs);
    expect(moveLeg(legs, 2, 1)).toBe(legs);
  });

  it("does not mutate the input", () => {
    moveLeg(legs, 0, 1);
    expect(legs.map((l) => l.area)).toEqual(["a", "b", "c"]);
  });
});
