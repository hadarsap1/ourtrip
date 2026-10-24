import { describe, expect, it } from "vitest";
import { buildProposals, proposeHebrewName, renderReport, splitSegments, type DayRow } from "./segmentCleanup";

function days(label: string, cc: string, start: string, n: number): DayRow[] {
  const out: DayRow[] = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), location_name: label, country_code: cc });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("segmentCleanup", () => {
  it("splits runs by label and country", () => {
    const s = splitSegments([...days("תאילנד", "TH", "2026-11-21", 2), ...days("קמבודיה", "KH", "2026-11-23", 3)]);
    expect(s.map((x) => [x.label, x.nights])).toEqual([["תאילנד", 2], ["קמבודיה", 3]]);
  });

  it("keeps Hebrew labels and strips Thai district prefixes", () => {
    expect(proposeHebrewName("קיוטו").name).toBe("קיוטו");
    expect(proposeHebrewName("Amphoe Mueang Chiang Mai")).toEqual({ name: "צ'יאנג מאי", hadAdminPrefix: true });
    expect(proposeHebrewName("Somewhere Unknown").name).toBeNull();
  });

  it("flags an adjacent spelling split and a separate repeat visit, never merges", () => {
    const rows = [
      ...days("Tokyo", "JP", "2027-03-23", 7),
      ...days("קיוטו", "JP", "2027-03-30", 4),
      ...days("Kyoto", "JP", "2027-04-03", 7),
      ...days("אוסקה", "JP", "2027-04-10", 3),
      ...days("טוקיו", "JP", "2027-04-24", 11),
    ];
    const p = buildProposals(rows);
    expect(p).toHaveLength(5);
    const kyoto = p.find((x) => x.label === "Kyoto")!;
    expect(kyoto.proposedLabel).toBe("קיוטו");
    expect(kyoto.flags.map((f) => f.kind)).toContain("adjacent-same-place");
    const tokyo = p.find((x) => x.label === "Tokyo")!;
    expect(tokyo.flags.map((f) => f.kind)).toContain("repeat-visit");
    expect(tokyo.flags.map((f) => f.kind)).not.toContain("adjacent-same-place");
  });

  it("flags a city stop that splits a country segment", () => {
    const p = buildProposals([
      ...days("תאילנד", "TH", "2026-11-21", 2),
      ...days("Amphoe Mueang Chiang Mai", "TH", "2026-11-23", 3),
      ...days("תאילנד", "TH", "2026-11-26", 4),
    ]);
    expect(p[1].flags.map((f) => f.kind)).toEqual(expect.arrayContaining(["latin-label", "admin-prefix", "stop-inside-country"]));
  });

  it("renders rename SQL scoped to each segment's dates and escapes quotes", () => {
    const report = renderReport(buildProposals(days("Amphoe Mueang Chiang Mai", "TH", "2026-11-23", 3)), "test");
    expect(report).toContain("set location_name = 'צ''יאנג מאי'");
    expect(report).toContain("between '2026-11-23' and '2026-11-25'");
    expect(report).toContain("nothing was changed");
  });
});
