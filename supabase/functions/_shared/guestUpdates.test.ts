import { describe, expect, it } from "vitest";
import { guestQuietNow, guestUpdateRecipients, type AllowRow, type GuestRow } from "./guestUpdates";

const members: GuestRow[] = [
  { id: "owner", role: "owner", email: "p@x.test" },
  { id: "kid", role: "kid", email: null },
  { id: "grandma", role: "guest", email: "Grandma@x.test" },
  { id: "classmate", role: "guest", email: "class@x.test" },
  { id: "revoked", role: "guest", email: "gone@x.test" },
  { id: "noemail", role: "guest", email: null },
];
const allowlist: AllowRow[] = [
  { email: "grandma@x.test", labels: [] },
  { email: "class@x.test", labels: ["class"] },
];

describe("guestUpdateRecipients", () => {
  it("a story for everyone reaches every active guest, nobody else", () => {
    expect(guestUpdateRecipients(members, allowlist, { kind: "story", audience: [] })).toEqual(["grandma", "classmate"]);
  });

  it("a group story reaches only that group's guests", () => {
    expect(guestUpdateRecipients(members, allowlist, { kind: "story", audience: ["class"] })).toEqual(["classmate"]);
    expect(guestUpdateRecipients(members, allowlist, { kind: "story", audience: ["other"] })).toEqual([]);
  });

  it("an episode reaches every active guest", () => {
    expect(guestUpdateRecipients(members, allowlist, { kind: "episode", audience: [] })).toEqual(["grandma", "classmate"]);
  });

  it("a revoked guest gets nothing", () => {
    expect(guestUpdateRecipients(members, [], { kind: "story", audience: [] })).toEqual([]);
  });
});

describe("guestQuietNow (Israel time)", () => {
  it("is quiet at 23:30 and 06:59 in Israel, not at 07:00 or 21:59", () => {
    // 19/11/2026: Israel is UTC+2
    expect(guestQuietNow(new Date("2026-11-19T21:30:00Z"))).toBe(true);
    expect(guestQuietNow(new Date("2026-11-19T04:59:00Z"))).toBe(true);
    expect(guestQuietNow(new Date("2026-11-19T05:00:00Z"))).toBe(false);
    expect(guestQuietNow(new Date("2026-11-19T19:59:00Z"))).toBe(false);
  });
});
