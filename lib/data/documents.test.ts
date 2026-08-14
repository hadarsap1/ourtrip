import { describe, expect, it } from "vitest";
import { expiryStatus } from "./documents";

const TODAY = "2026-08-14";

function doc(tag: string, expires_on: string | null) {
  return { tag, expires_on };
}

describe("expiryStatus", () => {
  it("returns null for a document with no expiry date", () => {
    expect(expiryStatus(doc("other", null), TODAY)).toBeNull();
  });

  it("counts whole days to the expiry date", () => {
    expect(expiryStatus(doc("visa", "2026-08-24"), TODAY)?.daysLeft).toBe(10);
    expect(expiryStatus(doc("visa", "2026-08-14"), TODAY)?.daysLeft).toBe(0);
  });

  it("flags a passport critical inside six months, not one", () => {
    // 100 days out: fine for a visa, already critical for a passport — this is
    // the six-months-validity rule the whole feature exists for.
    expect(expiryStatus(doc("passport", "2026-11-22"), TODAY)?.level).toBe(
      "critical"
    );
    expect(expiryStatus(doc("visa", "2026-11-22"), TODAY)?.level).toBe("ok");
  });

  it("warns 'soon' in the month before the tag's own threshold", () => {
    // passport threshold is 180 days, so 200 days out is soon, 220 is ok
    expect(expiryStatus(doc("passport", "2027-03-02"), TODAY)?.level).toBe("soon");
    expect(expiryStatus(doc("passport", "2027-03-22"), TODAY)?.level).toBe("ok");
    // 40 days out is soon for a visa, 70 is ok
    expect(expiryStatus(doc("visa", "2026-09-23"), TODAY)?.level).toBe("soon");
    expect(expiryStatus(doc("visa", "2026-10-23"), TODAY)?.level).toBe("ok");
  });

  it("reports an already-lapsed document as expired with negative days", () => {
    const status = expiryStatus(doc("insurance", "2026-08-01"), TODAY);
    expect(status?.level).toBe("expired");
    expect(status?.daysLeft).toBe(-13);
  });

  it("treats the expiry day itself as critical, not expired", () => {
    expect(expiryStatus(doc("insurance", TODAY), TODAY)?.level).toBe("critical");
  });

  it("falls back to the 30-day threshold for an unknown tag", () => {
    expect(expiryStatus(doc("mystery", "2026-09-01"), TODAY)?.level).toBe(
      "critical"
    );
  });

  it("is not fooled by daylight-saving shifts across the range", () => {
    // Israel leaves DST in late October; a naive local-time diff can land on
    // 89 or 91 days here instead of 90.
    expect(expiryStatus(doc("visa", "2026-11-12"), TODAY)?.daysLeft).toBe(90);
  });
});
