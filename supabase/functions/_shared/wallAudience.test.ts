import { describe, expect, it } from "vitest";
import { canReadWallMessage, type WallReader } from "./wallAudience";

const owner: WallReader = { role: "owner", guestLabels: [], active: true };
const kid: WallReader = { role: "kid", guestLabels: [], active: true };
const omerClassParent: WallReader = { role: "guest", guestLabels: ["כיתה עומר", "חברים"], active: true };
const ellaClassParent: WallReader = { role: "guest", guestLabels: ["כיתה אלה"], active: true };
const noGroup: WallReader = { role: "guest", guestLabels: [], active: true };
const revoked: WallReader = { ...omerClassParent, active: false };

const everyone = { pending: false, audience: [] };
const omerClass = { pending: false, audience: ["כיתה עומר"] };

describe("canReadWallMessage", () => {
  it("a message to everyone reaches everyone active", () => {
    for (const r of [owner, kid, omerClassParent, ellaClassParent, noGroup]) {
      expect(canReadWallMessage(r, everyone)).toBe(true);
    }
    expect(canReadWallMessage(revoked, everyone)).toBe(false);
  });

  it("a class message reaches the whole family and that class only", () => {
    expect(canReadWallMessage(owner, omerClass)).toBe(true);
    expect(canReadWallMessage(kid, omerClass)).toBe(true);
    expect(canReadWallMessage(omerClassParent, omerClass)).toBe(true);
    expect(canReadWallMessage(ellaClassParent, omerClass)).toBe(false);
    expect(canReadWallMessage(noGroup, omerClass)).toBe(false);
    expect(canReadWallMessage(revoked, omerClass)).toBe(false);
  });

  it("several groups: guests in any of them", () => {
    const both = { pending: false, audience: ["כיתה עומר", "כיתה אלה"] };
    expect(canReadWallMessage(ellaClassParent, both)).toBe(true);
    expect(canReadWallMessage(noGroup, both)).toBe(false);
  });

  it("a pending kid's message is the parents' alone, whatever its audience", () => {
    for (const audience of [[], ["כיתה עומר"]]) {
      const pending = { pending: true, audience };
      expect(canReadWallMessage(owner, pending)).toBe(true);
      expect(canReadWallMessage(kid, pending)).toBe(false);
      expect(canReadWallMessage(omerClassParent, pending)).toBe(false);
    }
  });
});
