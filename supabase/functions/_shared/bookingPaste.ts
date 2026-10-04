// Paste-to-import (Phase 2.1): the JSON schema the model must fill, and the
// sanitizer that every reply passes through before the app sees it. Shared by
// the booking-paste Edge Function and its unit tests; no imports, so Deno and
// Node both compile it as is.
//
// The model output is untrusted twice over: the pasted text may be hostile
// (anyone can send a "confirmation"), and the model may simply be wrong. So
// nothing here trusts a field: enums are enforced, dates and times are
// re-validated, strings are trimmed and capped, numbers must be finite, and
// every field carries a confidence the owner sees before saving.

export const PASTE_TYPES = ["flight", "hotel", "train", "attraction", "car_rental", "other"] as const;
export type PasteType = (typeof PASTE_TYPES)[number];

export const PASTE_FIELDS = [
  "type",
  "title",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "confirmation_code",
  "cost",
  "currency",
  "provider",
  "flight_number",
  "terminal",
  "address",
] as const;
export type PasteField = (typeof PASTE_FIELDS)[number];

export type PasteBooking = {
  type: PasteType;
  title: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  confirmation_code: string | null;
  cost: number | null;
  currency: string | null;
  provider: string | null;
  flight_number: string | null;
  terminal: string | null;
  address: string | null;
  notes: string | null;
  /** 0..1 per field that has a value. Below LOW_CONFIDENCE the UI flags it. */
  confidence: Partial<Record<PasteField, number>>;
};

export const LOW_CONFIDENCE = 0.7;
export const MAX_PASTE_CHARS = 8000;

const str = { type: ["string", "null"] };
export const PASTE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "True only if the text confirms a reservation." },
    booking: {
      type: "object",
      properties: {
        type: { type: "string", enum: [...PASTE_TYPES] },
        title: { type: "string", description: "Property name, or 'Origin - Destination' for a flight/train. No dates, no provider." },
        start_date: { ...str, description: "Check-in / departure date, YYYY-MM-DD." },
        end_date: { ...str, description: "Check-out / return date, YYYY-MM-DD, or null." },
        start_time: { ...str, description: "Departure / check-in time, HH:MM 24h, or null." },
        end_time: { ...str, description: "Arrival / check-out time, HH:MM 24h, or null." },
        confirmation_code: str,
        cost: { type: ["number", "null"], description: "Total price, number only." },
        currency: { ...str, description: "ISO 4217 code of the cost." },
        provider: str,
        flight_number: str,
        terminal: str,
        address: str,
        notes: { ...str, description: "One short Hebrew sentence with anything important not in the fields (baggage, free-cancellation deadline), or null." },
        confidence: {
          type: "object",
          description: "For each field you filled, how sure you are it is stated in the text, 0..1. Below 0.7 means you inferred or the text was ambiguous.",
          properties: Object.fromEntries(PASTE_FIELDS.map((f) => [f, { type: "number" }])),
        },
      },
      required: ["type", "title", "confidence"],
    },
  },
  required: ["found"],
};

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function validDate(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return d.toISOString().slice(0, 10) === v ? v : null; // rejects 2026-02-31
}

/** Returns a clean booking, or null when the reply is not a usable booking. */
export function sanitizePaste(raw: unknown): PasteBooking | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { found?: unknown; booking?: Record<string, unknown> };
  if (r.found !== true || !r.booking || typeof r.booking !== "object") return null;
  const b = r.booking;
  const title = text(b.title, 120);
  if (!title) return null;
  const type = (PASTE_TYPES as readonly string[]).includes(b.type as string) ? (b.type as PasteType) : "other";
  const start = validDate(b.start_date);
  let end = validDate(b.end_date);
  if (end && start && end < start) end = null;
  const time = (v: unknown) => (typeof v === "string" && HHMM.test(v.trim()) ? v.trim() : null);
  const cost = typeof b.cost === "number" && Number.isFinite(b.cost) && b.cost >= 0 && b.cost < 1e9 ? Math.round(b.cost * 100) / 100 : null;
  const currencyRaw = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "";
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : null;

  const out: PasteBooking = {
    type,
    title,
    start_date: start,
    end_date: end,
    start_time: time(b.start_time),
    end_time: time(b.end_time),
    confirmation_code: text(b.confirmation_code, 40),
    cost,
    currency: cost === null ? null : currency,
    provider: text(b.provider, 60),
    flight_number: text(b.flight_number, 12),
    terminal: text(b.terminal, 20),
    address: text(b.address, 200),
    notes: text(b.notes, 200),
    confidence: {},
  };
  const conf = b.confidence && typeof b.confidence === "object" ? (b.confidence as Record<string, unknown>) : {};
  for (const f of PASTE_FIELDS) {
    if (out[f] === null || out[f] === undefined) continue;
    const c = conf[f];
    // A missing confidence is not a high one.
    out.confidence[f] = typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5;
  }
  // A type we had to coerce is never confident.
  if (type !== b.type) out.confidence.type = 0;
  return out;
}

export function isLowConfidence(b: PasteBooking, f: PasteField): boolean {
  const c = b.confidence[f];
  return c !== undefined && c < LOW_CONFIDENCE;
}
