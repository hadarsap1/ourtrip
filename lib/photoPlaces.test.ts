import { describe, expect, it } from "vitest";
import { groupByPlace, placeByDate } from "./photoPlaces";

const days = [
  { date: "2026-10-26", location_name: "האנוי", country_code: "VN", lat: 21.03, lng: 105.85 },
  { date: "2026-10-27", location_name: "האנוי", country_code: "VN", lat: 21.03, lng: 105.85 },
  { date: "2026-10-28", location_name: "הא לונג", country_code: "VN", lat: 20.95, lng: 107.08 },
  { date: "2026-10-29", location_name: "האנוי", country_code: "VN", lat: 21.03, lng: 105.85 },
];
const photo = (id: string, taken_on: string) => ({ id, taken_on });

describe("groupByPlace", () => {
  it("one section per stretch, newest first, newest photo first", () => {
    const groups = groupByPlace(
      [photo("e", "2026-10-29"), photo("c", "2026-10-28"), photo("b", "2026-10-27"), photo("a", "2026-10-26")],
      placeByDate(days)
    );
    expect(groups.map((g) => [g.place, g.from, g.to, g.photos.map((p) => p.id).join("")])).toEqual([
      ["האנוי", "2026-10-29", "2026-10-29", "e"],
      ["הא לונג", "2026-10-28", "2026-10-28", "c"],
      ["האנוי", "2026-10-26", "2026-10-27", "ba"],
    ]);
    expect(groups[0].lat).toBe(21.03);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it("within a day, the latest upload first", () => {
    const up = (id: string, created_at: string) => ({ id, taken_on: "2026-10-26", created_at });
    const groups = groupByPlace(
      [up("old", "2026-10-26T08:00:00Z"), up("new", "2026-10-27T20:00:00Z"), up("mid", "2026-10-26T12:00:00Z")],
      placeByDate(days)
    );
    expect(groups[0].photos.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("keeps the order within a day without an upload time", () => {
    const groups = groupByPlace([photo("x", "2026-10-26"), photo("y", "2026-10-26")], placeByDate(days));
    expect(groups[0].photos.map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("a day with no known place is its own section, one per date", () => {
    const groups = groupByPlace(
      [photo("a", "2026-11-05"), photo("b", "2026-11-05"), photo("c", "2026-11-06")],
      () => undefined
    );
    expect(groups.map((g) => [g.place, g.from, g.photos.length])).toEqual([
      [null, "2026-11-06", 1],
      [null, "2026-11-05", 2],
    ]);
  });
});
