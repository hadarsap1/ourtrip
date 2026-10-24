import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The weekly backup lists its tables by hand (supabase/functions/backup-weekly).
// It drifted twice - in 2026-08 and again when the sharing tables arrived - so
// every table the migrations leave standing must be in that list.
const root = join(__dirname, "..");

function tablesFromMigrations(): Set<string> {
  const dir = join(root, "supabase/migrations");
  const tables = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8").replace(/--.*$/gm, "");
    // public tables only: private.app_secrets (00052) is deliberately not backed up
    const publicName = (name: string) => (name.startsWith("public.") ? name.slice(7) : name.includes(".") ? null : name);
    for (const m of sql.matchAll(/create table (?:if not exists )?([a-z_]+(?:\.[a-z_]+)?)/gi)) {
      const t = publicName(m[1]);
      if (t) tables.add(t);
    }
    for (const m of sql.matchAll(/drop table (?:if exists )?([a-z_]+(?:\.[a-z_]+)?)/gi)) {
      const t = publicName(m[1]);
      if (t) tables.delete(t);
    }
  }
  return tables;
}

function tablesInBackup(): Set<string> {
  const src = readFileSync(join(root, "supabase/functions/backup-weekly/index.ts"), "utf8");
  const list = src.slice(src.indexOf("const TABLES = ["), src.indexOf("] as const"));
  return new Set([...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
}

describe("weekly backup covers the schema", () => {
  it("lists every table the migrations create", () => {
    const backup = tablesInBackup();
    const missing = [...tablesFromMigrations()].filter((t) => !backup.has(t)).sort();
    expect(missing).toEqual([]);
  });
});
