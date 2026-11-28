import { describe, expect, it } from "vitest";
import { friendInvite, friendState, groupFriendLinks, isFriendEmail } from "./friends";
import { strings } from "./strings";

const now = new Date("2026-11-28T10:00:00Z");
const later = "2026-11-29T10:00:00Z";
const earlier = "2026-11-27T10:00:00Z";

describe("friendState", () => {
  it("reads the invitation's life", () => {
    expect(friendState({ used_at: null, revoked_at: null, expires_at: later }, now)).toBe("waiting");
    expect(friendState({ used_at: null, revoked_at: null, expires_at: earlier }, now)).toBe("expired");
    expect(friendState({ used_at: earlier, revoked_at: null, expires_at: earlier }, now)).toBe("connected");
    expect(friendState({ used_at: earlier, revoked_at: earlier, expires_at: later }, now)).toBe("revoked");
  });
});

describe("friendInvite", () => {
  it("fills the kid, the link and the code", () => {
    const text = friendInvite(strings.friends.shareText, { kid: "אלה", url: "https://x.test/kid-login", code: "ABCD2345" });
    expect(text).toContain("אלה");
    expect(text).toContain("https://x.test/kid-login");
    expect(text).toContain("ABCD2345");
    expect(text).not.toMatch(/\{\w+\}/);
  });
});

describe("isFriendEmail", () => {
  it("matches only the made-up friend addresses", () => {
    expect(isFriendEmail("kid-1@kids.ourtrip.app")).toBe(true);
    expect(isFriendEmail("savta@example.com")).toBe(false);
    expect(isFriendEmail(null)).toBe(false);
  });
});

describe("groupFriendLinks", () => {
  it("puts a friend's chats together, oldest first, and leaves codes alone", () => {
    const links = [
      { id: "c2", member_id: "noa", created_at: "2026-11-28T12:00:00Z" },
      { id: "w1", member_id: null, created_at: "2026-11-28T11:00:00Z" },
      { id: "c1", member_id: "noa", created_at: "2026-11-28T09:00:00Z" },
      { id: "d1", member_id: "dan", created_at: "2026-11-27T09:00:00Z" },
    ];
    const groups = groupFriendLinks(links);
    expect(groups.map((g) => g.key)).toEqual(["noa", "w1", "dan"]);
    expect(groups[0].links.map((l) => l.id)).toEqual(["c1", "c2"]);
  });
});
