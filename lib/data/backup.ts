// Backup / export (Phase 2.8) - reads the trip's exportable tables as the
// signed-in owner (RLS decides what that is; owners see the whole trip).

import { getSupabase } from "@/lib/supabase";
import { BACKUP_TABLES } from "@/lib/backup";

type Row = Record<string, unknown>;
type Untyped = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const CHUNK = 200;

async function selectIn(db: Untyped, table: string, column: string, ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db.from(table).select("*").in(column, ids.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

export async function fetchBackupData(tripId: string): Promise<Record<string, Row[]>> {
  const client = getSupabase();
  if (!client) throw new Error("supabase not configured");
  const db = client as unknown as Untyped;
  const out: Record<string, Row[]> = {};
  for (const spec of BACKUP_TABLES.filter((s) => s.by === "trip")) {
    const q = spec.name === "trips" ? db.from("trips").select("*").eq("id", tripId) : db.from(spec.name).select("*").eq("trip_id", tripId);
    const { data, error } = await q;
    if (error) throw new Error(`${spec.name}: ${error.message}`);
    out[spec.name] = data ?? [];
  }
  const ids = (t: string) => (out[t] ?? []).map((r) => r.id as string);
  out.itinerary_items = await selectIn(db, "itinerary_items", "day_id", ids("itinerary_days"));
  out.checklist_items = await selectIn(db, "checklist_items", "checklist_id", ids("checklists"));
  out.booking_files = await selectIn(db, "booking_files", "booking_id", ids("bookings"));
  return out;
}
