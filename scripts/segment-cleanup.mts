// F6 segment cleanup - DRY RUN ONLY. Reads itinerary_days, proposes Hebrew
// display names, flags possible duplicates, and writes a Markdown report.
// It never writes to the database; the report contains rename SQL for a human
// to review and run by hand.
//
// Usage (Node 22.18+ runs .mts directly):
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/segment-cleanup.mts --dry-run
//   node scripts/segment-cleanup.mts --input days.json        # offline, from an export
//   options: --out docs/upgrade/segment-cleanup.md
//
// The service-role key bypasses RLS, so run this only on your own machine and
// never commit the key. A JSON export (`--input`) needs no key at all.

import { readFile, writeFile } from "node:fs/promises";
import { buildProposals, renderReport, type DayRow } from "../lib/segmentCleanup.ts";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--apply")) {
  console.error("There is no --apply. Review the report and run the SQL yourself.");
  process.exit(2);
}

const input = arg("--input");
const out = arg("--out") ?? "docs/upgrade/segment-cleanup.md";

async function loadDays(): Promise<DayRow[]> {
  if (input) return JSON.parse(await readFile(input, "utf8")) as DayRow[];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --input days.json");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const { data, error } = await createClient(url, key)
    .from("itinerary_days")
    .select("date, location_name, country_code")
    .order("date");
  if (error) throw new Error(error.message);
  return data as DayRow[];
}

const days = await loadDays();
const proposals = buildProposals(days);
const report = renderReport(proposals, new Date().toISOString().slice(0, 10));
await writeFile(out, report, "utf8");
const flagged = proposals.filter((p) => p.flags.length).length;
console.log(`${proposals.length} segments, ${flagged} flagged, ${proposals.filter((p) => p.changed).length} renames proposed → ${out}`);
