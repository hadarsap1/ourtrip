// Sprint 8 — weekly database backup (SPEC §5, ROADMAP "never cut"). Exports
// every trip-data table to a single timestamped JSON file in the private
// `backups` storage bucket. Invoked by pg_cron (Sunday 03:00 UTC), so it is
// deployed verify_jwt=false; it reads/writes with the service role only and
// returns no data, so anonymous invocation can at most trigger a redundant
// backup (accepted risk — docs/SECURITY-CHECKS.md).

import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Every public table carrying trip content. Storage objects (photos, docs,
// booking files) are backed by Supabase's own bucket durability and are not
// re-exported here — this is a structured-data snapshot.
const TABLES = [
  "trips",
  "members",
  "kid_devices",
  "kid_device_registrations",
  "itinerary_days",
  "itinerary_items",
  "bookings",
  "budget_categories",
  "expenses",
  "documents",
  "journal_entries",
  "photos",
  "messages",
  "message_reads",
  "guests_allowlist",
  "map_pins",
  "routes",
  "checklists",
  "checklist_items",
  "pocket_money",
  "pocket_expenses",
  "emergency_info",
  "phrasebook_entries",
  "saved_recommendations",
  "push_subscriptions",
  "fx_rates",
] as const;

Deno.serve(async () => {
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const snapshot: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    tables: {} as Record<string, unknown[]>,
  };
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const { data, error } = await service.from(table).select("*");
    if (error) {
      return json({ ok: false, error: `${table}: ${error.message}` }, 500);
    }
    (snapshot.tables as Record<string, unknown[]>)[table] = data ?? [];
    counts[table] = data?.length ?? 0;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const path = `backup-${stamp}.json`;
  const { error: uploadError } = await service.storage
    .from("backups")
    .upload(path, JSON.stringify(snapshot), {
      contentType: "application/json",
      upsert: true,
    });
  if (uploadError) {
    return json({ ok: false, error: uploadError.message }, 500);
  }

  const pruned = await pruneOldBackups(service);
  return json({ ok: true, path, counts, pruned });
});

// Retention (audit P-6). Nothing pruned these before, so the bucket grew
// without bound — and each snapshot contains every row of the trip, including
// kid_devices token/PIN hashes. Two months of weekly snapshots is enough to
// recover from a mistake noticed late, and keeps the blast radius small.
const KEEP_BACKUPS = 8;

async function pruneOldBackups(
  service: ReturnType<typeof createClient>
): Promise<number> {
  const { data: files, error } = await service.storage
    .from("backups")
    .list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  // Pruning is housekeeping: a failure here must never fail the backup that
  // just succeeded, which is the part that actually matters.
  if (error || !files) return 0;

  // Names are `backup-<ISO timestamp>.json`, so a descending name sort is a
  // descending time sort. Filter first — an unrelated object must not shift
  // the window and cause a real snapshot to be deleted.
  const stale = files
    .filter((f) => f.name.startsWith("backup-") && f.name.endsWith(".json"))
    .slice(KEEP_BACKUPS)
    .map((f) => f.name);
  if (stale.length === 0) return 0;

  const { error: removeError } = await service.storage
    .from("backups")
    .remove(stale);
  return removeError ? 0 : stale.length;
}
