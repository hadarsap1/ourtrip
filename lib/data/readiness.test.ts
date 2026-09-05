import { describe, expect, it } from "vitest";
import {
  buildReadiness,
  countOutstanding,
  daysUntil,
  urgentChecks,
  type ReadinessInput,
} from "./readiness";

// The whole point of this screen is that it tells the truth about how ready the
// trip is, so the rules for what counts as ready are pinned down here rather
// than checked by looking at the screen and hoping.

const base: ReadinessInput = {
  today: "2026-09-05",
  tripStart: "2026-11-03",
  tripEnd: "2027-06-17",
  documents: [],
  daysTotal: 227,
  daysWithItems: 0,
  firstDays: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-11-${String(i + 3).padStart(2, "0")}`,
    hasItems: false,
  })),
  bookings: 0,
  countries: [
    { code: "VN", days: 53, optionsInBank: 229, hasEmergency: true, hasPhrasebook: true },
    { code: "GE", days: 36, optionsInBank: 0, hasEmergency: true, hasPhrasebook: false },
  ],
  kidDevices: 0,
  guests: 0,
  pushSubscriptions: 0,
};

const find = (input: ReadinessInput, key: string) =>
  buildReadiness(input)
    .flatMap((g) => g.checks)
    .find((c) => c.key === key);

describe("daysUntil", () => {
  it("counts whole days forward", () => {
    expect(daysUntil("2026-09-05", "2026-11-03")).toBe(59);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntil("2026-12-01", "2026-11-03")).toBe(-28);
  });

  it("returns null when there is no date to count to", () => {
    expect(daysUntil("2026-09-05", null)).toBeNull();
  });
});

describe("buildReadiness", () => {
  it("reports a missing passport as missing, not as a warning", () => {
    expect(find(base, "doc_passport")?.status).toBe("missing");
  });

  it("clears once the document exists", () => {
    const withDocs = {
      ...base,
      documents: [{ tag: "passport", expires_at: null }],
    };
    expect(find(withDocs, "doc_passport")?.status).toBe("ok");
  });

  it("warns about a document that expires DURING the trip", () => {
    const expiring = {
      ...base,
      documents: [{ tag: "passport", expires_at: "2027-01-01" }],
    };
    const check = find(expiring, "doc_expiring");
    expect(check?.status).toBe("warn");
    expect(check?.values?.n).toBe(1);
  });

  it("does not warn about one that outlasts the trip", () => {
    const fine = {
      ...base,
      documents: [{ tag: "passport", expires_at: "2028-01-01" }],
    };
    expect(find(fine, "doc_expiring")?.status).toBe("ok");
  });

  it("skips the expiry row entirely when the vault is empty", () => {
    // 0 of 0 expiring is not reassuring, it is noise.
    expect(find(base, "doc_expiring")).toBeUndefined();
  });

  it("separates 'nothing planned at all' from 'some days planned'", () => {
    expect(find(base, "days_planned")?.status).toBe("missing");
    const partly = { ...base, daysWithItems: 40 };
    expect(find(partly, "days_planned")?.status).toBe("warn");
    const done = { ...base, daysWithItems: 227 };
    expect(find(done, "days_planned")?.status).toBe("ok");
  });

  it("names the countries with nothing collected, and how many days they cost", () => {
    const check = find(base, "bank_coverage");
    expect(check?.status).toBe("warn");
    expect(check?.values?.countries).toBe("GE");
    expect(check?.values?.days).toBe(36);
  });

  it("treats a country with no emergency page as missing, not a warning", () => {
    const noEmergency = {
      ...base,
      countries: base.countries.map((c) => ({ ...c, hasEmergency: false })),
    };
    expect(find(noEmergency, "emergency")?.status).toBe("missing");
    expect(find(base, "emergency")?.status).toBe("ok");
  });

  it("counts every unfinished check once", () => {
    // The empty trip: 2 missing docs, first days, bookings, days, bank,
    // phrasebook, kid devices, guests, push. Emergency is the only ok row.
    const groups = buildReadiness(base);
    const all = groups.flatMap((g) => g.checks);
    expect(countOutstanding(groups)).toBe(
      all.filter((c) => c.status !== "ok").length
    );
    expect(countOutstanding(groups)).toBeGreaterThan(0);
  });

  it("reports nothing outstanding once everything is in place", () => {
    const ready: ReadinessInput = {
      ...base,
      documents: [
        { tag: "passport", expires_at: "2028-01-01" },
        { tag: "insurance", expires_at: null },
      ],
      daysWithItems: 227,
      firstDays: base.firstDays.map((d) => ({ ...d, hasItems: true })),
      bookings: 4,
      countries: base.countries.map((c) => ({
        ...c,
        optionsInBank: 10,
        hasEmergency: true,
        hasPhrasebook: true,
      })),
      kidDevices: 2,
      guests: 3,
      pushSubscriptions: 2,
    };
    expect(countOutstanding(buildReadiness(ready))).toBe(0);
  });
});

describe("urgentChecks", () => {
  const groups = [
    {
      key: "a",
      checks: [
        { key: "w1", status: "warn" as const },
        { key: "m1", status: "missing" as const },
      ],
    },
    {
      key: "b",
      checks: [
        { key: "ok1", status: "ok" as const },
        { key: "m2", status: "missing" as const },
        { key: "w2", status: "warn" as const },
      ],
    },
  ];

  it("puts everything missing ahead of everything merely warning", () => {
    expect(urgentChecks(groups, 4).map((c) => c.key)).toEqual([
      "m1",
      "m2",
      "w1",
      "w2",
    ]);
  });

  it("never offers something that is already fine", () => {
    expect(urgentChecks(groups, 10).some((c) => c.status === "ok")).toBe(false);
  });

  it("respects the limit", () => {
    expect(urgentChecks(groups, 2)).toHaveLength(2);
  });

  it("returns nothing when the trip is ready", () => {
    const ready = [{ key: "a", checks: [{ key: "ok", status: "ok" as const }] }];
    expect(urgentChecks(ready, 4)).toEqual([]);
  });
});
