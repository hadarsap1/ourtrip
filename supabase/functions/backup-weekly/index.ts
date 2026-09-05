// Sprint 8 - weekly database backup (SPEC §5, ROADMAP "never cut"). Exports
// every trip-data table to a single timestamped JSON file in the private
// `backups` storage bucket. Invoked by pg_cron (Sunday 03:00 UTC), so it is
// deployed verify_jwt=false. Anonymous invocation was previously an accepted
// risk; the review pointed out that "returns no data" understates it - the
// response carries the backup path and a per-table row count, and the dump
// itself holds messages, emergency_info and kid_devices behind a single
// bucket policy. Since migration 00025 the cron job sends a shared secret and
// cronAuthorized() checks it.
//
// INCIDENT, 2026-08-29. This function had been failing silently for three
// weeks. Migration 00021 dropped `saved_recommendations` (superseded by
// place_options), but it stayed in TABLES below, so every run errored on that
// one table and returned 500 before writing anything. The cron job kept
// reporting success - net.http_post only queues the request - so nothing
// surfaced it. Last good backup: 2026-08-09. Two fixes, both below:
//
//   1. the list is corrected, and now carries the newer tables it had also
//      drifted past (document_pin, document_passkeys, google_photos,
//      place_options);
//   2. a failing table no longer aborts the run. It is recorded in `failed`
//      and the snapshot is still written. A backup missing one table is worth
//      far more than no backup, and the failure is now visible in the
//      response instead of silently costing weeks of history.

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- shared-secret gate (review findings M3/M4) ----
// This function runs verify_jwt=false because pg_cron carries no JWT, which
// left it invokable by anyone who knows the URL. The cron job now sends
// x-cron-secret (migration 00025) and we check it here.
//
// Deliberately fails OPEN while CRON_SECRET is unset: shipping the check
// before the secret exists would stop this job with nothing surfacing the
// failure, which is the silent breakage supabase/config.toml exists to
// prevent. Setting CRON_SECRET (both sides - see 00025) switches it on.
function cronAuthorized(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return true;
  const got = req.headers.get("x-cron-secret") ?? "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Every public table carrying trip content. Storage objects (photos, docs,
// booking files) are backed by Supabase's own bucket durability and are not
// re-exported here - this is a structured-data snapshot.
//
// Keep this in step with the schema. `document_pin` in particular is not
// optional: it holds the per-vault salt, and without that row the passphrase
// cannot re-derive the key, so every locked document is lost for good.
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
  "document_pin",
  "document_passkeys",
  "journal_entries",
  "photos",
  "google_photos",
  "messages",
  "message_reads",
  "guests_allowlist",
  "map_pins",
  "routes",
  "place_options",
  "checklists",
  "checklist_items",
  "pocket_money",
  "pocket_expenses",
  "emergency_info",
  "phrasebook_entries",
  "push_subscriptions",
  "fx_rates",
] as const;

Deno.serve(async (req) => {
  if (!cronAuthorized(req)) return json({ ok: false, error: "forbidden" }, 401);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  const failed: Record<string, string> = {};

  for (const table of TABLES) {
    const { data, error } = await service.from(table).select("*");
    if (error) {
      // Do not abort - see the incident note at the top of this file.
      failed[table] = error.message;
      console.error(`backup-weekly: ${table}: ${error.message}`);
      continue;
    }
    tables[table] = data ?? [];
    counts[table] = data?.length ?? 0;
  }

  // A run where nothing at all could be read is a real failure - writing an
  // empty snapshot over a healthy history would be worse than writing nothing.
  if (Object.keys(tables).length === 0) {
    return json({ ok: false, error: "every table failed", failed }, 500);
  }

  const snapshot = {
    exported_at: new Date().toISOString(),
    failed_tables: failed,
    tables,
  };

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

  const failedNames = Object.keys(failed);
  return json({
    ok: true,
    path,
    counts,
    ...(failedNames.length > 0 ? { failed, warning: `${failedNames.length} table(s) skipped` } : {}),
  });
});
