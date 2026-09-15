import { describe, expect, it } from "vitest";
import {
  buildVisaGroups,
  limitRowOf,
  stayBlocks,
  stayWarnings,
  trustOf,
  type StayBlock,
} from "./visas";
import type { VisaRequirement } from "@/lib/types";

// This screen's one real claim is "your block is longer than your permission".
// A wrong answer here is a wrong answer at a border, so the arithmetic is
// pinned down in tests rather than checked by reading the screen.

function row(over: Partial<VisaRequirement>): VisaRequirement {
  return {
    id: over.id ?? "r1",
    trip_id: "t1",
    country_code: "TH",
    country_he: "תאילנד",
    requirement_type: "visa",
    title_he: "ויזת תייר",
    official_url: null,
    max_days: null,
    fee_note: null,
    deadline_note: null,
    status: "todo",
    verified_at: "2026-09-15",
    source: "claude",
    sort_order: 0,
    notes: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...over,
  };
}

function days(from: string, count: number, country: string | null) {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    country_code: country,
  }));
}

describe("stayBlocks", () => {
  it("counts each entry separately when a country is visited twice", () => {
    const blocks = stayBlocks([
      ...days("2026-10-31", 21, "VN"),
      ...days("2026-11-21", 38, "TH"),
      ...days("2026-12-29", 28, "KH"),
      ...days("2027-01-26", 35, "VN"),
    ]);
    expect(blocks.map((b) => [b.countryCode, b.days])).toEqual([
      ["VN", 21],
      ["TH", 38],
      ["KH", 28],
      ["VN", 35],
    ]);
    expect(blocks[0]).toMatchObject({ start: "2026-10-31", end: "2026-11-20" });
    expect(blocks[3]).toMatchObject({ start: "2027-01-26", end: "2027-03-01" });
  });

  it("breaks a block on a gap in the dates, not only on a change of country", () => {
    const blocks = stayBlocks([
      ...days("2027-03-02", 3, "PH"),
      ...days("2027-03-10", 2, "PH"),
    ]);
    expect(blocks.map((b) => b.days)).toEqual([3, 2]);
  });

  it("ignores days with no country and unsorted input", () => {
    const blocks = stayBlocks([
      { date: "2027-05-14", country_code: "GE" },
      { date: "2027-05-13", country_code: "GE" },
      { date: "2027-05-15", country_code: null },
    ]);
    expect(blocks).toEqual([
      { countryCode: "GE", start: "2027-05-13", end: "2027-05-14", days: 2 },
    ]);
  });
});

describe("limitRowOf", () => {
  it("takes the visa row, not the extension that exists to fix a long stay", () => {
    const rows = [
      row({ id: "ext", requirement_type: "extension", max_days: 30 }),
      row({ id: "visa", requirement_type: "visa", max_days: 60 }),
      row({ id: "card", requirement_type: "arrival_card", max_days: 90 }),
    ];
    expect(limitRowOf(rows)?.id).toBe("visa");
  });

  it("falls back to the row that says no visa is needed", () => {
    const rows = [row({ id: "none", requirement_type: "none", max_days: 365 })];
    expect(limitRowOf(rows)?.id).toBe("none");
  });

  it("is null when nothing carries a day limit", () => {
    expect(limitRowOf([row({ requirement_type: "arrival_card" })])).toBeNull();
  });
});

describe("stayWarnings", () => {
  const block = (days: number): StayBlock => ({
    countryCode: "TH",
    start: "2026-11-21",
    end: "2026-12-28",
    days,
  });

  it("warns when a single block is longer than the permitted stay", () => {
    const warnings = stayWarnings([row({ max_days: 30 })], [block(38)]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: "over", maxDays: 30 });
  });

  it("warns quietly when the block is within three days of the limit", () => {
    expect(stayWarnings([row({ max_days: 30 })], [block(28)])[0].kind).toBe("near");
  });

  it("says nothing when there is real headroom", () => {
    expect(stayWarnings([row({ max_days: 60 })], [block(38)])).toEqual([]);
  });

  it("says nothing when no row carries a limit", () => {
    expect(
      stayWarnings([row({ requirement_type: "arrival_card" })], [block(38)])
    ).toEqual([]);
  });
});

describe("buildVisaGroups", () => {
  it("groups by country in route order and attaches that country's blocks", () => {
    const rows = [
      row({ id: "vn", country_code: "VN", country_he: "וייטנאם", max_days: 90, sort_order: 10 }),
      row({ id: "th", country_code: "TH", max_days: 30, sort_order: 20 }),
      row({
        id: "th-card",
        country_code: "TH",
        requirement_type: "arrival_card",
        sort_order: 21,
      }),
    ];
    const blocks = stayBlocks([
      ...days("2026-10-31", 21, "VN"),
      ...days("2026-11-21", 38, "TH"),
      ...days("2027-01-26", 35, "VN"),
    ]);
    const groups = buildVisaGroups(rows, blocks);

    expect(groups.map((g) => g.countryCode)).toEqual(["VN", "TH"]);
    expect(groups[0].blocks).toHaveLength(2);
    expect(groups[0].warnings).toEqual([]);
    expect(groups[1].rows).toHaveLength(2);
    expect(groups[1].warnings[0].kind).toBe("over");
  });
});

describe("trustOf", () => {
  it("calls a row with no verification date unverified", () => {
    expect(trustOf(null, "2026-09-15")).toBe("unverified");
  });

  it("calls a rule checked more than 90 days ago stale", () => {
    // 17/06 is exactly 90 days before 15/09; one day earlier is over the line.
    expect(trustOf("2026-06-17", "2026-09-15")).toBe("ok");
    expect(trustOf("2026-06-16", "2026-09-15")).toBe("stale");
  });

  it("trusts a rule checked today", () => {
    expect(trustOf("2026-09-15", "2026-09-15")).toBe("ok");
  });
});
