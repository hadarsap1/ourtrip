import { describe, expect, it } from "vitest";
import { applyWallChange, canApplyWallChange, isPending, threadWall, unreadCount, type WallMessage } from "./messages";

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

describe("threadWall", () => {
  const m = (id: string, at: string, reply_to: string | null = null) => ({ id, created_at: at, reply_to });

  it("puts replies under their message, oldest first", () => {
    const threads = threadWall([
      m("a", "2026-10-22T10:00:00Z"),
      m("r2", "2026-10-22T10:20:00Z", "a"),
      m("r1", "2026-10-22T10:10:00Z", "a"),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("a new reply brings its conversation to the bottom", () => {
    const threads = threadWall([
      m("old", "2026-10-22T09:00:00Z"),
      m("new", "2026-10-22T11:00:00Z"),
      m("reply", "2026-10-22T12:00:00Z", "old"),
    ]);
    expect(threads.map((t) => t.message.id)).toEqual(["new", "old"]);
  });

  it("drops a reply whose message is not here", () => {
    expect(threadWall([m("r", "2026-10-22T10:00:00Z", "missing")])).toEqual([]);
  });
});
