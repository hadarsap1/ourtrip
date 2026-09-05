import { describe, expect, it } from "vitest";
import {
  destinationForDate,
  destinationKey,
  pickFactOfDay,
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
