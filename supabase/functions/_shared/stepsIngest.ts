// Steps counter ingest (Phase 2): validation for the steps-ingest Edge
// Function. Pure (WebCrypto only), so Node tests and Deno share it.
//
// The caller is an Apple Shortcuts automation on a parent's iPhone. It holds a
// per-phone token (43-char base64url, 256 bits) - never a Supabase key - and
// POSTs {"token", "steps", "date"} once a day. Only the SHA-256 of the token
// is stored (public.step_tokens).

export const MAX_STEPS = 200_000;
export const MIN_INTERVAL_MS = 20_000; // one phone may not post more than every 20 s
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type IngestInput = {
  token: string;
  steps: number;
  date: string;
  /** Backfill: earlier days' totals from the same phone, nearest first. */
  prev?: { date: string; steps: number }[];
};
export const MAX_PREV = 3;
export type IngestError = "bad_request" | "bad_token" | "bad_steps" | "bad_date";

const DAY_MS = 86_400_000;

/** Shortcuts may send a number, "12345" or a localized "12,345". */
function parseSteps(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s .](?=\d{3}\b)/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= MAX_STEPS ? r : null;
}

/**
 * The phone's local date (YYYY-MM-DD), defaulting to `today` (UTC). Must lie
 * between 3 days ago and tomorrow (UTC), which covers every time zone on the
 * route and a phone that missed a couple of days, and nothing else.
 */
function parseDate(v: unknown, now: Date): string | null {
  const today = now.toISOString().slice(0, 10);
  if (v === undefined || v === null || v === "") return today;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) return null;
  const base = Date.parse(`${today}T00:00:00Z`);
  return t >= base - 3 * DAY_MS && t <= base + DAY_MS ? v : null;
}

export function parseIngest(body: unknown, now = new Date()): IngestInput | { error: IngestError } {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const b = body as Record<string, unknown>;
  if (typeof b.token !== "string" || !TOKEN_RE.test(b.token.trim())) return { error: "bad_token" };
  const steps = parseSteps(b.steps);
  if (steps === null) return { error: "bad_steps" };
  const date = parseDate(b.date, now);
  if (date === null) return { error: "bad_date" };
  const prev = parsePrev(b.prev, date, now);
  return prev.length ? { token: b.token.trim(), steps, date, prev } : { token: b.token.trim(), steps, date };
}

/**
 * Optional backfill so a missed evening heals itself: `prev` holds the totals
 * of the days before `date`, nearest first (yesterday, the day before, ...),
 * as an array or as text with one number per line (Shortcuts "Combine Text"
 * with New Lines; an empty line keeps its day's place). Lenient on purpose: a bad or zero entry, or a day outside
 * the date window, is skipped rather than failing today's report, and zeros
 * never overwrite a real count.
 */
function parsePrev(v: unknown, date: string, now: Date): { date: string; steps: number }[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n|;/).map((x) => x.trim()) : [];
  const base = Date.parse(`${date}T00:00:00Z`);
  const out: { date: string; steps: number }[] = [];
  list.slice(0, MAX_PREV).forEach((raw, i) => {
    const steps = parseSteps(raw);
    const d = new Date(base - (i + 1) * DAY_MS).toISOString().slice(0, 10);
    if (steps && parseDate(d, now) === d) out.push({ date: d, steps });
  });
  return out;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** A fresh 256-bit token, base64url without padding (43 chars). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function tooSoon(lastUsedAt: string | null, now = new Date()): boolean {
  if (!lastUsedAt) return false;
  const t = Date.parse(lastUsedAt);
  return Number.isFinite(t) && now.getTime() - t < MIN_INTERVAL_MS;
}
