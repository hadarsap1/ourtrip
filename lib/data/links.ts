import { getSupabase } from "@/lib/supabase";
import { getCurrentMember } from "@/lib/data/trip";
import type { SavedLink } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function listLinks(tripId: string): Promise<SavedLink[]> {
  const { data, error } = await requireClient()
    .from("saved_links")
    .select("*")
    .eq("trip_id", tripId)
    .order("country", { ascending: true, nullsFirst: false })
    .order("area", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export type LinkInput = {
  title: string;
  url: string;
  country: string | null;
  area: string | null;
  note: string | null;
};

/** Normalizes a URL so a bare "facebook.com/..." still opens correctly. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function createLink(tripId: string, input: LinkInput): Promise<void> {
  const member = await getCurrentMember();
  const { error } = await requireClient().from("saved_links").insert({
    trip_id: tripId,
    title: input.title.trim(),
    url: normalizeUrl(input.url),
    country: input.country?.trim() || null,
    area: input.area?.trim() || null,
    note: input.note?.trim() || null,
    created_by: member?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateLink(id: string, input: LinkInput): Promise<void> {
  const { error } = await requireClient()
    .from("saved_links")
    .update({
      title: input.title.trim(),
      url: normalizeUrl(input.url),
      country: input.country?.trim() || null,
      area: input.area?.trim() || null,
      note: input.note?.trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await requireClient().from("saved_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
