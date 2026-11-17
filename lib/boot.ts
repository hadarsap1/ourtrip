// One request to open the app (00096). The gate, the member store, the home
// and the approval counts each used to ask the database their own question,
// one after another - six round trips in a row before the home could show
// anything, each paying the trip to the database's region. app_boot answers
// them together, as the caller (same RLS as the separate queries), and each
// of those loaders takes its part from here when the answer is fresh.
//
// Everything keeps its own query as the fallback: a database without the
// function yet, a failed call, or an answer that is no longer fresh all mean
// "ask the way you always did". Nothing here is kept on the device - the
// loaders' own offline copies (trip, member, today's snapshot) are unchanged.

import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/format";
import type { PendingApprovals } from "@/lib/approvals";
import type { Booking, ItineraryDay, ItineraryItem, Member, Trip } from "@/lib/types";

export type BootToday = { date: string; day: ItineraryDay | null; items: ItineraryItem[]; bookings: Booking[] };
export type Boot = {
  role: Member["role"] | null;
  member: Member | null;
  trip: Trip | null;
  today: BootToday | null;
  pending: PendingApprovals | null;
};

export type BootResult =
  | { kind: "ok"; boot: Boot }
  /** the database has no app_boot (older than 00096): use the separate queries */
  | { kind: "unsupported" }
  /** the call did not get through; `error` is what the gate used to get from its own call */
  | { kind: "failed"; error: unknown };

/** An answer serves the loaders this long. Past it they ask again themselves,
 *  so a count approved a moment ago or an edited day is never served stale. */
export const BOOT_FRESH_MS = 8_000;

let current: { at: number; result: Promise<BootResult> } | null = null;

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Narrow what the function returned; anything unexpected reads as "nothing". */
export function parseBoot(raw: unknown): Boot {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const role = o.role === "owner" || o.role === "kid" || o.role === "guest" ? o.role : null;
  const today = o.today && typeof o.today === "object" ? (o.today as Record<string, unknown>) : null;
  const pending = o.pending && typeof o.pending === "object" ? (o.pending as Record<string, unknown>) : null;
  return {
    role,
    member: role && o.member && typeof o.member === "object" ? (o.member as Member) : null,
    trip: o.trip && typeof o.trip === "object" ? (o.trip as Trip) : null,
    today:
      today && typeof today.date === "string"
        ? {
            date: today.date,
            day: today.day && typeof today.day === "object" ? (today.day as ItineraryDay) : null,
            items: asArray<ItineraryItem>(today.items),
            bookings: asArray<Booking>(today.bookings),
          }
        : null,
    pending: pending
      ? {
          stories: count(pending.stories),
          photos: count(pending.photos),
          episodes: count(pending.episodes),
          guestRequests: count(pending.guestRequests),
        }
      : null,
  };
}

async function callBoot(): Promise<BootResult> {
  const supabase = getSupabase();
  if (!supabase) return { kind: "failed", error: new Error("supabase not configured") };
  try {
    // the function's name is not in the generated types until they are regenerated
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const { data, error } = await rpc.call(supabase, "app_boot", { p_today: todayISO() });
    if (error) {
      // PGRST202: no such function in the schema cache; 42883: undefined function
      if (error.code === "PGRST202" || error.code === "42883") return { kind: "unsupported" };
      return { kind: "failed", error };
    }
    return { kind: "ok", boot: parseBoot(data) };
  } catch (error) {
    return { kind: "failed", error };
  }
}

/** The opening request: the one in the air or just answered, else a new one. */
export function requestBoot(now: number = Date.now()): Promise<BootResult> {
  if (current && now - current.at < BOOT_FRESH_MS) return current.result;
  const entry = { at: now, result: callBoot() };
  current = entry;
  return entry.result;
}

/** The fresh answer, or null - the caller then asks the way it always did.
 *  Never starts a request of its own after the first one has gone stale. */
export async function freshBoot(now: number = Date.now()): Promise<Boot | null> {
  if (current && now - current.at >= BOOT_FRESH_MS) return null;
  const result = await requestBoot(now);
  return result.kind === "ok" ? result.boot : null;
}

/** Forget the answer: the login changed in place (kid PIN unlock, sign-out),
 *  or the member's own row was just edited. */
export function invalidateBoot(): void {
  current = null;
}
