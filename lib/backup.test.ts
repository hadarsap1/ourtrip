import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, buildBackup, dryRunRestore, EXCLUDED_TABLES, rowKey, validateBackup } from "./backup";

describe("backup / export (Phase 2.8)", () => {
  it("never exports sensitive tables or member emails", () => {
    const names = BACKUP_TABLES.map((t) => t.name);
    for (const x of EXCLUDED_TABLES) expect(names).not.toContain(x);
    const b = buildBackup("t", { members: [{ id: "m", display_name: "הדר", email: "x@y.z", auth_user_id: "u", role: "owner" }], documents: [{ id: "secret" }] });
    expect(b.tables.members[0]).toEqual({ id: "m", display_name: "הדר", role: "owner" });
    expect(b.tables).not.toHaveProperty("documents");
    expect(b).toMatchObject({ app: "ourtrip", version: 1, tripId: "t" });
  });

  it("validates uploaded files", () => {
    expect(validateBackup(null)).toEqual({ ok: false, error: "not_json" });
    expect(validateBackup({ app: "other" })).toEqual({ ok: false, error: "not_ourtrip" });
    expect(validateBackup({ app: "ourtrip", version: 99, tripId: "t", tables: {} })).toEqual({ ok: false, error: "version" });
    expect(validateBackup({ app: "ourtrip", version: 1, tripId: "t", tables: { bookings: "nope" } })).toEqual({ ok: false, error: "shape" });
    expect(validateBackup({ app: "ourtrip", version: 1, tripId: "t", tables: { documents: [] } })).toEqual({ ok: false, error: "shape" });
    expect(validateBackup(buildBackup("t", {})).ok).toBe(true);
  });

  it("keys id-less rows by their natural key", () => {
    expect(rowKey({ id: "a" })).toBe("a");
    expect(rowKey({ trip_id: "t", country_code: "VN" })).toBe('["t","VN"]');
  });

  it("dry-runs a restore: missing, changed (ignoring updated_at) and new rows", () => {
    const backup = buildBackup("t", {
      bookings: [
        { id: "1", title: "A", updated_at: "x" },
        { id: "2", title: "B", updated_at: "x" },
        { id: "3", title: "C", updated_at: "x" },
      ],
    });
    const current = {
      bookings: [
        { id: "1", title: "A", updated_at: "later" }, // same content
        { id: "2", title: "B changed", updated_at: "y" },
        { id: "4", title: "new", updated_at: "z" },
      ],
    };
    const d = dryRunRestore(backup, current).find((x) => x.table === "bookings")!;
    expect(d).toEqual({ table: "bookings", inBackup: 3, inCurrent: 3, wouldRestore: 1, changed: 1, onlyNow: 1 });
  });
});
