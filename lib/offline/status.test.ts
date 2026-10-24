import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getOfflineDB: () => null }));
const { formatLastSynced } = await import("./status");

describe("formatLastSynced", () => {
  const now = new Date(2026, 10, 11, 14, 20); // 11/11/2026 14:20 local

  it("handles no sync yet", () => {
    expect(formatLastSynced(null, now)).toBeNull();
  });

  it("uses minutes and hours with Hebrew dual forms", () => {
    expect(formatLastSynced(new Date(2026, 10, 11, 14, 19, 40).toISOString(), now)).toBe("לפני רגע");
    expect(formatLastSynced(new Date(2026, 10, 11, 14, 19).toISOString(), now)).toBe("לפני דקה");
    expect(formatLastSynced(new Date(2026, 10, 11, 14, 17).toISOString(), now)).toBe("לפני 3 דקות");
    expect(formatLastSynced(new Date(2026, 10, 11, 13, 10).toISOString(), now)).toBe("לפני שעה");
    expect(formatLastSynced(new Date(2026, 10, 11, 12, 10).toISOString(), now)).toBe("לפני שעתיים");
    expect(formatLastSynced(new Date(2026, 10, 11, 9, 0).toISOString(), now)).toBe("לפני 5 שעות");
  });

  it("says yesterday with a time, then a DD/MM date", () => {
    expect(formatLastSynced(new Date(2026, 10, 10, 21, 40).toISOString(), now)).toBe("אתמול ב-21:40");
    expect(formatLastSynced(new Date(2026, 10, 3, 8, 0).toISOString(), now)).toBe("ב-03/11");
  });
});
