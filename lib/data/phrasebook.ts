import { functionErrorCode } from "@/lib/functionError";
import { getSupabase } from "@/lib/supabase";
import {
  listPhrasebookLanguages,
  readPhrasebookSnapshot,
  savePhrasebookSnapshot,
} from "@/lib/offline/caches";
import type { PhrasebookEntry } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export type PhrasebookData = {
  languages: string[];
  fromCache: boolean;
};

/**
 * Languages with generated entries. Online: from DB; offline: from the
 * IndexedDB cache (acceptance: switching language works offline for
 * already-generated languages).
 */
export async function listLanguages(tripId: string): Promise<PhrasebookData> {
  try {
    const { data, error } = await requireClient()
      .from("phrasebook_entries")
      .select("language")
      .eq("trip_id", tripId);
    if (error) throw new Error(error.message);
    const languages = [...new Set(data.map((r) => r.language))].sort();
    return { languages, fromCache: false };
  } catch {
    return { languages: (await listPhrasebookLanguages()).sort(), fromCache: true };
  }
}

/** One language's entries; refreshes the offline cache on success. */
export async function listEntries(
  tripId: string,
  language: string
): Promise<{ entries: PhrasebookEntry[]; fromCache: boolean }> {
  try {
    const { data, error } = await requireClient()
      .from("phrasebook_entries")
      .select("*")
      .eq("trip_id", tripId)
      .eq("language", language)
      .order("category");
    if (error) throw new Error(error.message);
    await savePhrasebookSnapshot({
      language,
      entries: data.map((e) => ({
        id: e.id,
        category: e.category,
        phrase_he: e.phrase_he,
        phrase_local: e.phrase_local,
        phonetic_he: e.phonetic_he,
      })),
    });
    return { entries: data, fromCache: false };
  } catch {
    const snapshot = await readPhrasebookSnapshot(language);
    if (!snapshot) return { entries: [], fromCache: true };
    return {
      entries: snapshot.entries.map((e) => ({
        ...e,
        trip_id: "",
        language,
        country_code: null,
      })),
      fromCache: true,
    };
  }
}

/** Invokes the Edge Function (owner-gated server-side). Takes ~15-60s. */
export async function generateLanguage(
  language: string,
  countryCode?: string | null
): Promise<void> {
  const { data, error } = await requireClient().functions.invoke(
    "phrasebook-generate",
    { body: { language, country_code: countryCode ?? null } }
  );
  if (error) throw new Error((await functionErrorCode(error)) ?? "generation failed");
  if (!data?.ok) throw new Error(data?.error ?? "generation failed");
}

/** Hebrew display name for a language code, falling back to the code. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["he"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// Shortlist for the "new language" picker (multi-country trip - free-text
// code entry also supported in the UI).
export const COMMON_LANGUAGES = [
  "ja", "th", "vi", "zh", "ko", "id", "hi", "el",
  "tr", "es", "pt", "fr", "it", "de", "nl", "ar",
] as const;

/**
 * Filters the phrasebook as you type.
 *
 * Matches the Hebrew, the local script AND the transliteration, because all
 * three are things you might half-remember: you know it started with "sumimasen"
 * but not which category it was filed under. Pure and case-insensitive; it runs
 * on the already-loaded rows so it works offline, which is where the phrasebook
 * matters most.
 */
export function filterEntries<
  T extends {
    category: string;
    phrase_he: string;
    phrase_local: string;
    phonetic_he: string | null;
  },
>(entries: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return entries;
  return entries.filter((e) =>
    [e.phrase_he, e.phrase_local, e.phonetic_he ?? "", e.category].some((field) =>
      field.toLowerCase().includes(q)
    )
  );
}

export type LiveTranslation = {
  phrase_he: string;
  phrase_local: string;
  phonetic_he: string | null;
};

/**
 * Translates one phrase on the spot. Owner-gated server-side; needs a network.
 * Throws the function's own error code so the screen can say which failure it
 * was - out of credit is not the same as try again.
 */
export async function translatePhrase(
  text: string,
  language: string
): Promise<LiveTranslation> {
  const { data, error } = await requireClient().functions.invoke(
    "translate-phrase",
    { body: { text, language } }
  );
  if (error) {
    throw new Error((await functionErrorCode(error)) ?? "translate_failed");
  }
  if (!data?.ok) throw new Error(data?.error ?? "translate_failed");
  return {
    phrase_he: String(data.phrase_he ?? text),
    phrase_local: String(data.phrase_local ?? ""),
    phonetic_he: data.phonetic_he ? String(data.phonetic_he) : null,
  };
}
