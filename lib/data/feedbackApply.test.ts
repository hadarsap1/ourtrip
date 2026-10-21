import { describe, expect, it } from "vitest";
import { applyFeedbackChange, canApplyFeedbackChange } from "./feedback";

type Row = { id: string; created_at: string; kind?: string };
const row = (id: string, created_at: string): Row => ({ id, created_at });

describe("applying like/comment changes without a refetch", () => {
  const list = [row("a", "2026-10-21T10:00:00Z"), row("c", "2026-10-21T12:00:00Z")];

  it("adds a new like in time order", () => {
    const next = applyFeedbackChange(list, { table: "reactions", eventType: "INSERT", new: row("b", "2026-10-21T11:00:00Z"), old: {} });
    expect(next.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("does not double a row it already has", () => {
    const next = applyFeedbackChange(list, { table: "comments", eventType: "INSERT", new: row("a", "2026-10-21T10:00:00Z"), old: {} });
    expect(next).toHaveLength(2);
  });

  it("removes an unliked or deleted row by id", () => {
    const next = applyFeedbackChange(list, { table: "reactions", eventType: "DELETE", new: {}, old: { id: "c" } });
    expect(next.map((x) => x.id)).toEqual(["a"]);
  });

  it("asks for a reload when the payload has no row", () => {
    expect(canApplyFeedbackChange({ table: "comments", eventType: "INSERT", new: {}, old: {} })).toBe(false);
    expect(applyFeedbackChange(list, { table: "comments", eventType: "DELETE", new: {}, old: {} })).toBe(list);
  });
});
