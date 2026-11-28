import { describe, expect, it } from "vitest";
import { friendMessagePayload, friendParentsPayload, type FriendPushRow } from "./friendPush";

const row = (extra: Partial<FriendPushRow> = {}): FriendPushRow => ({
  kind: "message",
  link_id: "L1",
  member_id: "kid",
  from_name: "נועה",
  kid_name: "אלה",
  n: 1,
  since: null,
  ...extra,
});

describe("friendMessagePayload", () => {
  it("names who wrote and opens that chat", () => {
    const p = friendMessagePayload(row());
    expect(p.title).toBe("💬 הודעה חדשה מנועה");
    expect(p.url).toBe("/friends?chat=L1");
    expect(p.tag).toBe("friend-L1");
    expect(p.count).toBe(1);
  });

  it("several held at once say how many", () => {
    const p = friendMessagePayload(row({ n: 3 }));
    expect(p.title).toBe("💬 3 הודעות חדשות מנועה");
    expect(p.count).toBe(3);
    expect(p.many).toContain("{n}");
  });

  it("never carries words beyond the name", () => {
    const p = friendMessagePayload(row());
    expect(p.body).toBe("לחיצה פותחת את הצ'אט");
  });
});

describe("friendParentsPayload", () => {
  const now = new Date("2026-11-28T10:00:00Z");

  it("nothing when no kid waits", () => {
    expect(friendParentsPayload([row()], now)).toBeNull();
  });

  it("one kid: who waits, from whom, how long", () => {
    const p = friendParentsPayload([row({ kind: "parents", n: 1, since: "2026-11-28T09:44:00Z" })], now)!;
    expect(p.title).toBe("💬 מחכה הודעה לאלה");
    expect(p.body).toBe("הודעה מנועה, כבר 16 דקות");
    expect(p.url).toBe("/friends?chat=L1");
  });

  it("several messages are still one push", () => {
    const p = friendParentsPayload([row({ kind: "parents", n: 4, since: "2026-11-28T09:45:00Z" })], now)!;
    expect(p.body).toBe("4 הודעות מנועה, כבר 15 דקות");
  });

  it("several kids in one run: one push for all", () => {
    const p = friendParentsPayload(
      [
        row({ kind: "parents", since: "2026-11-28T09:40:00Z" }),
        row({ kind: "message" }),
        row({ kind: "parents", link_id: "L2", kid_name: "עומר", from_name: "דני", since: "2026-11-28T09:30:00Z" }),
      ],
      now
    )!;
    expect(p.title).toBe("💬 מחכות הודעות לילדים");
    expect(p.body).toBe("אלה - מנועה, עומר - מדני");
    expect(p.url).toBe("/friends");
    expect(p.tag).toBe("friend-waiting");
  });
});
