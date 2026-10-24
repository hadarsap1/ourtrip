import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// supabase-js does not type-check the column names given to .order() and the
// filters, so a column that does not exist compiles and fails at run time with
// a 400. That shipped once: the home screen ordered checklists by created_at,
// which the table does not have, and its checklist preview never showed (QA
// 21/10). This scans every query chain in the app against the table's columns
// in lib/database.types.ts.

const ROOT = join(__dirname, "..", "..");

function columnsByTable(): Map<string, Set<string>> {
  const src = readFileSync(join(ROOT, "lib", "database.types.ts"), "utf8");
  const out = new Map<string, Set<string>>();
  const table = /\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g;
  for (const m of src.matchAll(table)) {
    const cols = new Set([...m[2].matchAll(/^ {10}(\w+)\??:/gm)].map((c) => c[1]));
    out.set(m[1], cols);
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

type Use = { file: string; table: string; column: string };

function columnUses(): Use[] {
  const uses: Use[] = [];
  for (const file of ["lib", "components", "app"].flatMap((d) => sourceFiles(join(ROOT, d)))) {
    const src = readFileSync(file, "utf8");
    // one chain = from .from("table") up to the next .from( or the end of the statement
    for (const m of src.matchAll(/\.from\("(\w+)"\)([\s\S]*?)(?=\.from\(|;)/g)) {
      for (const c of m[2].matchAll(/\.(order|eq|neq|is|in|lt|lte|gt|gte|not)\("(\w+)"/g)) {
        uses.push({ file: file.slice(ROOT.length + 1), table: m[1], column: c[2] });
      }
    }
  }
  return uses;
}

describe("query columns exist", () => {
  const tables = columnsByTable();
  const uses = columnUses();

  it("finds the tables and the queries to check", () => {
    expect(tables.get("checklists")?.has("updated_at")).toBe(true);
    expect(uses.length).toBeGreaterThan(50);
  });

  it("orders and filters only by columns the table has", () => {
    // storage buckets share .from(); they are not tables and are skipped
    const wrong = uses
      .filter((u) => tables.has(u.table) && !tables.get(u.table)!.has(u.column))
      .map((u) => `${u.file}: ${u.table}.${u.column}`);
    expect(wrong).toEqual([]);
  });
});
