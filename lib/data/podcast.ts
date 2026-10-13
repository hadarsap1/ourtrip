// The kids' podcast (migration 00044). Kid recordings land pending and
// unshared whatever is sent (episodes_enforce_kid_rules); a parent approves,
// then separately shares with guests - same as photos (DECISIONS #4/#5).

import { getSupabase } from "@/lib/supabase";
import { baseMime, extensionFor } from "@/lib/audio";
import {
  listQueuedRecordings,
  queueRecording,
  removeQueuedRecording,
  type QueuedRecording,
} from "@/lib/offline/audioOutbox";
import type { Episode } from "@/lib/types";

const BUCKET = "audio";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** RLS scopes it: owners all, kids approved + own, guests approved + shared. */
export async function listEpisodes(tripId: string): Promise<Episode[]> {
  const { data, error } = await requireClient()
    .from("episodes")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

type NewEpisode = Omit<QueuedRecording, "id" | "createdAt">;

export async function uploadEpisode(input: NewEpisode): Promise<Episode> {
  const supabase = requireClient();
  const mime = baseMime(input.mime);
  const path = `${input.tripId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.blob, { contentType: mime });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      trip_id: input.tripId,
      recorded_by: input.memberId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      file_path: path,
      mime_type: mime,
      duration_seconds: Math.round(input.durationSeconds),
      // a parent's own recording may skip approval; sharing stays separate
      ...(input.isOwner ? { status: "approved" as const, approved_by: input.memberId } : {}),
    })
    .select()
    .single();
  if (error) {
    // don't leave an orphaned file behind a refused row
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data;
}

/**
 * Uploads, or keeps the recording on this device when there is no
 * connection. Returns the episode, or "queued".
 */
export async function uploadOrQueueEpisode(input: NewEpisode): Promise<Episode | "queued"> {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!offline) {
    try {
      return await uploadEpisode(input);
    } catch (e) {
      const { isConnectivityError } = await import("@/lib/data/expenses");
      if (!isConnectivityError(e)) throw e;
    }
  }
  await queueRecording({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  return "queued";
}

/** Sends whatever waited for a connection. Returns how many went up. */
export async function flushQueuedEpisodes(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  let sent = 0;
  for (const rec of await listQueuedRecordings()) {
    try {
      await uploadEpisode(rec);
      await removeQueuedRecording(rec.id);
      sent += 1;
    } catch {
      // still offline or refused - try again next time; never lose the take
      break;
    }
  }
  return sent;
}

export async function countQueuedEpisodes(): Promise<number> {
  return (await listQueuedRecordings()).length;
}

export async function setEpisodeStatus(id: string, status: "approved" | "rejected", ownerId: string): Promise<void> {
  const { error } = await requireClient()
    .from("episodes")
    .update({ status, approved_by: ownerId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** The separate, explicit second step (DECISIONS #5). */
export async function setEpisodeShared(id: string, shared: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("episodes")
    .update({ shared_with_guests: shared })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEpisode(episode: Episode): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("episodes").delete().eq("id", episode.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([episode.file_path]);
}

// ---------- parents' editor (migration 00047) ----------

export async function updateEpisodeDetails(
  id: string,
  details: { title: string; description: string | null }
): Promise<void> {
  const { error } = await requireClient()
    .from("episodes")
    .update({ title: details.title.trim(), description: details.description?.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Swaps in an edited take. The new file goes up first and the row moves to
 * it; only then is the old file removed, so a failure part-way never leaves
 * an episode pointing at nothing. Approval and sharing are untouched.
 */
export async function replaceEpisodeAudio(
  episode: Episode,
  wav: Blob,
  durationSeconds: number
): Promise<void> {
  const supabase = requireClient();
  const path = `${episode.trip_id}/${crypto.randomUUID()}.wav`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, wav, { contentType: "audio/wav" });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase
    .from("episodes")
    .update({ file_path: path, mime_type: "audio/wav", duration_seconds: Math.round(durationSeconds) })
    .eq("id", episode.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  await supabase.storage.from(BUCKET).remove([episode.file_path]);
}
