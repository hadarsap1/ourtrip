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

  return json({ ok: true, path, counts });
});
