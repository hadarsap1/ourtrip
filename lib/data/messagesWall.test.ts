import { describe, expect, it } from "vitest";
import { applyWallChange, canApplyWallChange, isPending, unreadCount, type WallMessage } from "./messages";

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

  describe("applying realtime changes without a refetch", () => {
    const msg = (id: string, created_at: string): WallMessage =>
      ({ id, created_at, channel: "guests", sender_id: "aunt", body: id } as WallMessage);
    const list = [msg("a", "2026-10-20T10:00:00Z"), msg("c", "2026-10-20T12:00:00Z")];

    it("inserts a new message in time order", () => {
      const next = applyWallChange(list, { eventType: "INSERT", new: msg("b", "2026-10-20T11:00:00Z"), old: {} });
      expect(next.map((m) => m.id)).toEqual(["a", "b", "c"]);
    });

    it("replaces an updated message (a parent approved it) instead of doubling it", () => {
      const approved = { ...msg("c", "2026-10-20T12:00:00Z"), approved_at: "2026-10-20T12:05:00Z" };
      const next = applyWallChange(list, { eventType: "UPDATE", new: approved, old: {} });
      expect(next).toHaveLength(2);
      expect(next[1].approved_at).toBe("2026-10-20T12:05:00Z");
    });

    it("removes a deleted message by id", () => {
      const next = applyWallChange(list, { eventType: "DELETE", new: {}, old: { id: "a" } });
      expect(next.map((m) => m.id)).toEqual(["c"]);
    });

    it("ignores the retired family channel", () => {
      const family = { ...msg("f", "2026-10-20T13:00:00Z"), channel: "family" } as WallMessage;
      expect(applyWallChange(list, { eventType: "INSERT", new: family, old: {} })).toEqual(list);
    });

    it("asks for a refetch when the payload has no row", () => {
      expect(canApplyWallChange({ eventType: "INSERT", new: {}, old: {} })).toBe(false);
      expect(canApplyWallChange({ eventType: "DELETE", new: {}, old: {} })).toBe(false);
    });
  });
});
