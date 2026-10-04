// Backup / export (Phase 2.8): the trip as one JSON file the family keeps, and
// a restore DRY RUN that compares such a file with today's data without
// writing anything. Pure, so tested. (The server-side weekly backup to the
// private bucket, backup-weekly, is separate and unchanged.)
//
// Deliberately NOT exported (sensitive or device-bound): documents and their
// PIN/passkeys, push subscriptions, kid devices/registrations, the guest
// allowlist, Google Photos links, message read receipts, FX cache, and member
// emails. File attachments are exported as metadata only, never the files.

export const BACKUP_VERSION = 1;

export type TableSpec = { name: string; by: "trip" | "day" | "checklist" | "booking"; omit?: string[] };

export const BACKUP_TABLES: TableSpec[] = [
  { name: "trips", by: "trip" },
  { name: "members", by: "trip", omit: ["email", "auth_user_id"] },
  { name: "itinerary_days", by: "trip" },
  { name: "itinerary_items", by: "day" },
  { name: "bookings", by: "trip" },
  { name: "booking_files", by: "booking" },
  { name: "budget_categories", by: "trip" },
  { name: "expenses", by: "trip" },
  { name: "place_options", by: "trip" },
  { name: "journal_entries", by: "trip" },
  { name: "checklists", by: "trip" },
  { name: "checklist_items", by: "checklist" },
  { name: "visa_requirements", by: "trip" },
  { name: "emergency_info", by: "trip" },
  { name: "map_pins", by: "trip" },
  { name: "routes", by: "trip" },
  { name: "phrasebook_entries", by: "trip" },
  { name: "destination_facts", by: "trip" },
  { name: "messages", by: "trip" },
  { name: "photos", by: "trip" },
  { name: "pocket_money", by: "trip" },
  { name: "pocket_expenses", by: "trip" },
];

export const EXCLUDED_TABLES = [
  "documents",
  "document_pin",
  "document_passkeys",
  "push_subscriptions",
  "kid_devices",
  "kid_device_registrations",
  "guests_allowlist",
  "google_photos",
  "message_reads",
  "fx_rates",
];

type Row = Record<string, unknown>;
export type Backup = { app: "ourtrip"; version: number; exportedAt: string; tripId: string; tables: Record<string, Row[]> };

export function buildBackup(tripId: string, data: Record<string, Row[]>, now = new Date()): Backup {
  const tables: Record<string, Row[]> = {};
  for (const spec of BACKUP_TABLES) {
    const rows = data[spec.name] ?? [];
    tables[spec.name] = rows.map((r) => {
      if (!spec.omit) return r;
      const copy = { ...r };
      for (const k of spec.omit) delete copy[k];
      return copy;
    });
  }
  return { app: "ourtrip", version: BACKUP_VERSION, exportedAt: now.toISOString(), tripId, tables };
}

export function validateBackup(raw: unknown): { ok: true; backup: Backup } | { ok: false; error: "not_json" | "not_ourtrip" | "version" | "shape" } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not_json" };
  const b = raw as Partial<Backup>;
  if (b.app !== "ourtrip") return { ok: false, error: "not_ourtrip" };
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) return { ok: false, error: "version" };
  if (typeof b.tripId !== "string" || !b.tables || typeof b.tables !== "object") return { ok: false, error: "shape" };
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object")) return { ok: false, error: "shape" };
    if (EXCLUDED_TABLES.includes(name)) return { ok: false, error: "shape" };
  }
  return { ok: true, backup: b as Backup };
}

/** Stable identity of a row: its id, else the natural key of id-less tables. */
export function rowKey(r: Row): string {
  if (typeof r.id === "string") return r.id;
  return JSON.stringify([r.trip_id ?? null, r.country_code ?? r.key ?? r.date ?? null]);
}

const comparable = (r: Row) => {
  const { updated_at: _u, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return JSON.stringify(rest, Object.keys(rest).sort());
};

export type TableDiff = { table: string; inBackup: number; inCurrent: number; wouldRestore: number; changed: number; onlyNow: number };

/**
 * Dry run: what restoring `backup` over `current` would do, per table.
 *  - wouldRestore: rows in the backup that no longer exist now;
 *  - changed: rows present in both whose content differs (restore would revert them);
 *  - onlyNow: rows created after the backup (a restore would keep them).
 * Nothing is written - this is the whole feature of a dry run.
 */
export function dryRunRestore(backup: Backup, current: Record<string, Row[]>): TableDiff[] {
  return BACKUP_TABLES.map(({ name }) => {
    const b = backup.tables[name] ?? [];
    const c = current[name] ?? [];
    const now = new Map(c.map((r) => [rowKey(r), r]));
    const then = new Set(b.map(rowKey));
    let wouldRestore = 0;
    let changed = 0;
    for (const r of b) {
      const cur = now.get(rowKey(r));
      if (!cur) wouldRestore++;
      else if (comparable(r) !== comparable(cur)) changed++;
    }
    const onlyNow = c.filter((r) => !then.has(rowKey(r))).length;
    return { table: name, inBackup: b.length, inCurrent: c.length, wouldRestore, changed, onlyNow };
  });
}
