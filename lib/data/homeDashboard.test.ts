import { describe, expect, it } from "vitest";
import { buildChecklistPreview, buildTimeline } from "./homeDashboard";
import type { Destination } from "./facts";

// "Which stretch are we in, and which is next" is the kind of off-by-one that
// looks right on the day you write it and is wrong on the day the trip starts.

const stretches: Destination[] = [
  { countryCode: "VN", locationName: "וייטנאם - צפון", days: 18, from: "2026-11-03", to: "2026-11-20" },
  { countryCode: "TH", locationName: "תאילנד", days: 38, from: "2026-11-21", to: "2026-12-28" },
  { countryCode: "JP", locationName: "טוקיו", days: 11, from: "2027-04-24", to: "2027-05-04" },
];

const noItems = new Map<string, number>();

describe("buildTimeline", () => {
  it("marks nothing current before departure, and the first stretch as next", () => {
    const out = buildTimeline(stretches, noItems, "2026-09-05");
    expect(out.some((s) => s.isCurrent)).toBe(false);
    expect(out.filter((s) => s.isNext).map((s) => s.locationName)).toEqual([
      "וייטנאם - צפון",
    ]);
  });

  it("marks the stretch the day falls inside, and then nothing is 'next'", () => {
    const out = buildTimeline(stretches, noItems, "2026-12-01");
    expect(out.filter((s) => s.isCurrent).map((s) => s.locationName)).toEqual([
      "תאילנד",
    ]);
    expect(out.some((s) => s.isNext)).toBe(false);
  });

  it("marks the first day of a stretch as current, not as next", () => {
    // The boundary that breaks: on 21/11 the family IS in Thailand.
    const out = buildTimeline(stretches, noItems, "2026-11-21");
    expect(out[1].isCurrent).toBe(true);
    expect(out[1].isNext).toBe(false);
  });

  it("looks forward from inside a gap between two stretches", () => {
    const out = buildTimeline(stretches, noItems, "2027-02-01");
    expect(out.filter((s) => s.isNext).map((s) => s.locationName)).toEqual([
      "טוקיו",
    ]);
  });

  it("has neither current nor next once the trip is over", () => {
    const out = buildTimeline(stretches, noItems, "2027-09-01");
    expect(out.some((s) => s.isCurrent || s.isNext)).toBe(false);
  });

  it("counts planned days onto the right stretch", () => {
    const counts = new Map([["TH::תאילנד", 6]]);
    const out = buildTimeline(stretches, counts, "2026-09-05");
    expect(out.map((s) => s.daysWithItems)).toEqual([0, 6, 0]);
  });

  it("returns nothing for an empty itinerary", () => {
    expect(buildTimeline([], noItems, "2026-09-05")).toEqual([]);
  });
});

describe("buildChecklistPreview", () => {
  const items = [
    { id: "1", label: "טיסות", checked: false },
    { id: "2", label: "ביטוח", checked: true },
    { id: "3", label: "ויזה לוייטנאם", checked: false },
    { id: "4", label: "חיסונים", checked: false },
    { id: "5", label: "לינה ראשונה", checked: false },
  ];

  it("counts done against the whole list", () => {
    const p = buildChecklistPreview({ id: "c", title: "הזמנות" }, items);
    expect(p?.total).toBe(5);
    expect(p?.done).toBe(1);
  });

  it("offers only open items, at most three", () => {
    const p = buildChecklistPreview({ id: "c", title: "הזמנות" }, items);
    expect(p?.open.map((i) => i.label)).toEqual([
      "טיסות",
      "ויזה לוייטנאם",
      "חיסונים",
    ]);
  });

  it("offers nothing once the list is finished, but still counts it", () => {
    const done = items.map((i) => ({ ...i, checked: true }));
    const p = buildChecklistPreview({ id: "c", title: "הזמנות" }, done);
    expect(p?.open).toEqual([]);
    expect(p?.done).toBe(5);
  });

  it("has nothing to show without a checklist", () => {
    expect(buildChecklistPreview(null, items)).toBeNull();
  });
});
