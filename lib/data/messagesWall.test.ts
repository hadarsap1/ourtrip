import { describe, expect, it } from "vitest";
import { isPending, unreadCount } from "./messages";

describe("the wall (00049)", () => {
  it("a message with no approval stamp is waiting for a parent", () => {
    expect(isPending({ approved_at: null })).toBe(true);
    expect(isPending({ approved_at: "2026-10-14T10:00:00Z" })).toBe(false);
  });

  it("counts other people's unread messages only", () => {
    const msgs = [
      { id: "a", sender_id: "me" },
      { id: "b", sender_id: "aunt" },
      { id: "c", sender_id: "omer" },
    ];
    expect(unreadCount(msgs, new Set(), "me")).toBe(2);
    expect(unreadCount(msgs, new Set(["b"]), "me")).toBe(1);
    expect(unreadCount([], new Set(), "me")).toBe(0);
  });
});
