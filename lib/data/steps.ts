// Steps counter (Phase 2) - reads for the Home card, token management for
// settings. Owners only: RLS on daily_steps / step_tokens (migration 00042)
// returns nothing to kids and guests, and inserts a token only for oneself.

import { getSupabase } from "@/lib/supabase";
import { getCurrentMember } from "@/lib/data/trip";
import { hashToken, newToken } from "@/supabase/functions/_shared/stepsIngest";
import type { StepRow } from "@/lib/stepsView";

function client() {
  const s = getSupabase();
  if (!s) throw new Error("supabase not configured");
  return s;
}

// The tables arrive with migration 00042; until the generated types include
// them, the client is addressed untyped here and only here.
type Untyped = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = () => client() as unknown as Untyped;

export type Parent = { id: string; name: string };

/** Both parents (owners) of the trip, for the card's columns. */
export async function listParents(tripId: string): Promise<Parent[]> {
  const { data, error } = await client().from("members").select("id, display_name").eq("trip_id", tripId).eq("role", "owner").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ id: m.id, name: m.display_name }));
}

export async function listSteps(memberIds: string[], from: string, to: string): Promise<StepRow[]> {
  if (memberIds.length === 0) return [];
  const { data, error } = await db()
    .from("daily_steps")
    .select("member_id, date, steps")
    .in("member_id", memberIds)
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(error.message);
  return (data ?? []) as StepRow[];
}

export type StepToken = { id: string; member_id: string; label: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null };

export async function listStepTokens(): Promise<StepToken[]> {
  const { data, error } = await db()
    .from("step_tokens")
    .select("id, member_id, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StepToken[];
}

/** Creates a token for the signed-in parent. The plaintext is returned once and never stored. */
export async function createStepToken(label: string): Promise<string> {
  const me = await getCurrentMember();
  if (!me || me.role !== "owner") throw new Error("forbidden");
  const token = newToken();
  const { error } = await db()
    .from("step_tokens")
    .insert({ member_id: me.id, token_hash: await hashToken(token), label: label.trim().slice(0, 40) || null });
  if (error) throw new Error(error.message);
  return token;
}

export async function revokeStepToken(id: string): Promise<void> {
  const { error } = await db().from("step_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** The URL the Shortcut posts to. */
export function stepsIngestUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/functions/v1/steps-ingest`;
}
