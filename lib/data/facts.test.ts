import { describe, expect, it } from "vitest";
import {
  destinationForDate,
  destinationKey,
  pickFactOfDay,
  splitDestinationLabel,
  type Destination,
} from "./facts";

// The two rules worth pinning down: the card must show the SAME fact on both
// kids' tablets on a given day, and "where are we" must answer something for
// every date, including the 59 days before the trip starts.

const stretches: Destination[] = [
  { countryCode: "VN", locationName: "וייטנאם - צפון", days: 18, from: "2026-11-03", to: "2026-11-20" },
  { countryCode: "TH", locationName: "תאילנד", days: 38, from: "2026-11-21", to: "2026-12-28" },
  { countryCode: "JP", locationName: "טוקיו", days: 11, from: "2027-04-24", to: "2027-05-04" },
];

describe("pickFactOfDay", () => {
  const facts = ["a", "b", "c", "d"];

  it("gives the same fact for the same date, every time", () => {
    expect(pickFactOfDay(facts, "2026-11-05")).toBe(
      pickFactOfDay(facts, "2026-11-05")
    );
  });

  it("moves on the next day", () => {
    expect(pickFactOfDay(facts, "2026-11-05")).not.toBe(
      pickFactOfDay(facts, "2026-11-06")
    );
  });

  it("comes back round rather than running out", () => {
    expect(pickFactOfDay(facts, "2026-11-05")).toBe(
      pickFactOfDay(facts, "2026-11-09")
    );
  });

  it("has nothing to show for an empty destination", () => {
    expect(pickFactOfDay([], "2026-11-05")).toBeNull();
  });

  it("still returns something when the date is unusable", () => {
    expect(pickFactOfDay(facts, "not-a-date")).toBe("a");
  });

  it("never falls off the array for a date before 1970", () => {
    // JS % keeps the dividend's sign, so a negative day number would index
    // out of bounds and hand the card `undefined` to render.
    expect(facts).toContain(pickFactOfDay(facts, "1965-03-02"));
  });
});

describe("destinationForDate", () => {
  it("finds the stretch the date falls inside", () => {
    expect(destinationForDate(stretches, "2026-12-01")?.locationName).toBe(
      "תאילנד"
    );
  });

  it("looks forward before the trip starts, so the card is never empty", () => {
    expect(destinationForDate(stretches, "2026-09-05")?.locationName).toBe(
      "וייטנאם - צפון"
    );
  });

  it("falls back to the last stretch once the trip is over", () => {
    expect(destinationForDate(stretches, "2027-08-01")?.locationName).toBe(
      "טוקיו"
    );
  });

  it("picks the next stretch in a gap between two", () => {
    expect(destinationForDate(stretches, "2027-02-01")?.locationName).toBe(
      "טוקיו"
    );
  });

  it("has no answer with no itinerary", () => {
    expect(destinationForDate([], "2026-12-01")).toBeNull();
  });
});

describe("destinationKey", () => {
  it("keeps two stretches of the same country apart", () => {
    expect(destinationKey("VN", "וייטנאם - צפון")).not.toBe(
      destinationKey("VN", "וייטנאם - דרום ומרכז")
    );
  });
});

// The itinerary was imported with inconsistent names - Japan by city, everyone
// else by country - so the label has to be rebuilt from country_code rather
// than trusted as written. These are the fourteen real stretches.
describe("splitDestinationLabel", () => {
  it("names the country for a stretch that only says the city", () => {
    expect(splitDestinationLabel("JP", "קיוטו")).toEqual({
      country: "יפן",
      area: "קיוטו",
    });
    expect(splitDestinationLabel("JP", "טוקיו")).toEqual({
      country: "יפן",
      area: "טוקיו",
    });
  });

  it("does not repeat a name when the stretch IS the country", () => {
    expect(splitDestinationLabel("TH", "תאילנד")).toEqual({
      country: "תאילנד",
      area: null,
    });
    expect(splitDestinationLabel("KH", "קמבודיה")).toEqual({
      country: "קמבודיה",
      area: null,
    });
  });

  it("ignores the definite article Intl adds", () => {
    // Intl says "הפיליפינים", the itinerary says "פיליפינים".
    expect(splitDestinationLabel("PH", "פיליפינים")).toEqual({
      country: "הפיליפינים",
      area: null,
    });
  });

  it("splits a country-plus-region label on its separator", () => {
    expect(splitDestinationLabel("VN", "וייטנאם - צפון")).toEqual({
      country: "וייטנאם",
      area: "צפון",
    });
    expect(splitDestinationLabel("VN", "וייטנאם - דרום ומרכז")).toEqual({
      country: "וייטנאם",
      area: "דרום ומרכז",
    });
  });

  it("keeps a label the country name only happens to appear inside", () => {
    const out = splitDestinationLabel(
      "GE",
      "המקטע האחרון - פתוח (גאורגיה כברירת מחדל)"
    );
    expect(out.country).toBe("גאורגיה");
    expect(out.area).toBe("המקטע האחרון - פתוח (גאורגיה כברירת מחדל)");
  });

  it("never returns an empty area instead of null", () => {
    expect(splitDestinationLabel("JP", "יפן -")).toEqual({
      country: "יפן",
      area: null,
    });
    expect(splitDestinationLabel("JP", "  ")).toEqual({
      country: "יפן",
      area: null,
    });
  });
});
