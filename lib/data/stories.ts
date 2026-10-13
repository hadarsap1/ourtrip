// Stories (the blog) - migration 00043, public copies 00046.
// RLS decides what each role reads and writes; posts_guard decides what a kid
// may change. Nothing here re-implements those rules - a refused write comes
// back as an error.

import { getSupabase } from "@/lib/supabase";
import { photoUrls } from "@/lib/data/media";
import { titleFromJournal } from "@/lib/stories";
import type { JournalEntry } from "@/lib/data/journal";
import type { TablesUpdate } from "@/lib/database.types";
import type { MemberRole, Post, PostVisibility } from "@/lib/types";

const PUBLIC_BUCKET = "public-stories";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export type StoryPhoto = {
  photoId: string;
  position: number;
  url: string | null;
  publicPath: string | null;
};

export type Story = Post & { photos: StoryPhoto[] };

export async function listStories(tripId: string, role: MemberRole | undefined): Promise<Story[]> {
  const supabase = requireClient();
  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (posts.length === 0) return [];

  // RLS returns a post_photos row only when the caller may see both the story
  // and the photo - for a guest, only approved + shared photos (00043).
  const { data: links, error: linkError } = await supabase
    .from("post_photos")
    .select("*")
    .in("post_id", posts.map((p) => p.id))
    .order("position");
  if (linkError) throw new Error(linkError.message);

  const urls = await photoUrls(role, (links ?? []).map((l) => l.photo_id)).catch(
    () => new Map<string, string | null>()
  );
  return posts.map((p) => ({
    ...p,
    photos: (links ?? [])
      .filter((l) => l.post_id === p.id)
      .map((l) => ({
        photoId: l.photo_id,
        position: l.position,
        url: urls.get(l.photo_id) ?? null,
        publicPath: l.public_path,
      })),
  }));
}

export type StoryInput = {
  title: string;
  body: string;
  placeLabel: string | null;
  countryCode?: string | null;
  dayId?: string | null;
  journalEntryId?: string | null;
  status: "draft" | "pending" | "approved";
  visibility: PostVisibility;
  publishAfter: string | null;
};

export async function createStory(tripId: string, authorId: string, input: StoryInput): Promise<Post> {
  const { data, error } = await requireClient()
    .from("posts")
    .insert({
      trip_id: tripId,
      author_id: authorId,
      title: input.title.trim(),
      body: input.body.trim(),
      place_label: input.placeLabel?.trim() || null,
      country_code: input.countryCode ?? null,
      day_id: input.dayId ?? null,
      journal_entry_id: input.journalEntryId ?? null,
      status: input.status,
      visibility: input.visibility,
      publish_after: input.publishAfter,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateStory(id: string, input: Partial<StoryInput>): Promise<Post> {
  const patch: TablesUpdate<"posts"> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.body !== undefined) patch.body = input.body.trim();
  if (input.placeLabel !== undefined) patch.place_label = input.placeLabel?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.publishAfter !== undefined) patch.publish_after = input.publishAfter;
  const { data, error } = await requireClient()
    .from("posts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Replaces the story's photos with `photoIds`, in that order. */
export async function setStoryPhotos(postId: string, photoIds: string[]): Promise<void> {
  const supabase = requireClient();
  const { data: current, error } = await supabase
    .from("post_photos")
    .select("photo_id")
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
  const removed = (current ?? []).map((r) => r.photo_id).filter((id) => !photoIds.includes(id));
  if (removed.length) {
    const { error: delError } = await supabase
      .from("post_photos")
      .delete()
      .eq("post_id", postId)
      .in("photo_id", removed);
    if (delError) throw new Error(delError.message);
  }
  const existing = new Set((current ?? []).map((r) => r.photo_id));
  const added = photoIds
    .map((photoId, position) => ({ post_id: postId, photo_id: photoId, position }))
    .filter((row) => !existing.has(row.photo_id));
  if (added.length) {
    const { error: insError } = await supabase.from("post_photos").insert(added);
    if (insError) throw new Error(insError.message);
  }
  // keep the order the author chose for the ones that stayed
  for (const [position, photoId] of photoIds.entries()) {
    if (!existing.has(photoId)) continue;
    await supabase.from("post_photos").update({ position }).eq("post_id", postId).eq("photo_id", photoId);
  }
}

/**
 * Parent approves and publishes. `sharePhotos` is the explicit second step of
 * DECISIONS #5, offered in the same sheet: it approves the story's photos and
 * shares them with guests, so a guests-story is not a story with holes.
 */
export async function approveStory(
  story: Story,
  visibility: PostVisibility,
  sharePhotos: boolean,
  ownerId: string
): Promise<void> {
  if (sharePhotos && visibility !== "family") {
    await shareStoryPhotos(story.photos.map((p) => p.photoId), ownerId);
  }
  await updateStory(story.id, { status: "approved", visibility });
}

/**
 * Approves and shares the given photos with guests - a parent's explicit
 * choice in the publish / approve sheet (DECISIONS #5: approval and sharing
 * stay two columns; the parent sets both, on purpose, in one tap).
 */
export async function shareStoryPhotos(photoIds: string[], ownerId: string): Promise<void> {
  if (photoIds.length === 0) return;
  const { error } = await requireClient()
    .from("photos")
    .update({ status: "approved", approved_by: ownerId, shared_with_guests: true })
    .in("id", photoIds);
  if (error) throw new Error(error.message);
}

export async function returnStoryToDraft(id: string): Promise<void> {
  await updateStory(id, { status: "draft" });
}

export async function deleteStory(story: Story): Promise<void> {
  await removePublicCopies(story);
  const { error } = await requireClient().from("posts").delete().eq("id", story.id);
  if (error) throw new Error(error.message);
}

// ---------- the open blog (00046) ----------

function publicPathFor(story: Pick<Post, "trip_id" | "id">, photoId: string): string {
  return `${story.trip_id}/${story.id}/${photoId}.jpg`;
}

/**
 * Brings the public copies in line with the story. Live public story: every
 * photo in it gets a copy in the public bucket. Anything else: every copy is
 * deleted. Runs on the parent's device after each save; the private bucket
 * is never made public (00046).
 */
export async function syncPublicCopies(story: Story): Promise<void> {
  const supabase = requireClient();
  const wantPublic = story.visibility === "public" && story.status === "approved";
  if (!wantPublic) {
    await removePublicCopies(story);
    return;
  }
  const missing = story.photos.filter((p) => !p.publicPath);
  if (missing.length === 0) return;
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, file_path")
    .in("id", missing.map((p) => p.photoId));
  if (error) throw new Error(error.message);
  for (const row of rows ?? []) {
    const { data: blob, error: downloadError } = await supabase.storage.from("photos").download(row.file_path);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "download failed");
    const path = publicPathFor(story, row.id);
    const { error: uploadError } = await supabase.storage
      .from(PUBLIC_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { error: linkError } = await supabase
      .from("post_photos")
      .update({ public_path: path })
      .eq("post_id", story.id)
      .eq("photo_id", row.id);
    if (linkError) throw new Error(linkError.message);
  }
}

async function removePublicCopies(story: Story): Promise<void> {
  const copied = story.photos.filter((p) => p.publicPath);
  if (copied.length === 0) return;
  const supabase = requireClient();
  await supabase.storage.from(PUBLIC_BUCKET).remove(copied.map((p) => p.publicPath!));
  await supabase
    .from("post_photos")
    .update({ public_path: null })
    .eq("post_id", story.id)
    .not("public_path", "is", null);
}

/** One story, fresh from the database (after a save, before syncing copies). */
export async function reloadStory(id: string, role: MemberRole | undefined): Promise<Story | null> {
  const supabase = requireClient();
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (!post) return null;
  const { data: links } = await supabase.from("post_photos").select("*").eq("post_id", id).order("position");
  const urls = await photoUrls(role, (links ?? []).map((l) => l.photo_id)).catch(() => new Map());
  return {
    ...post,
    photos: (links ?? []).map((l) => ({
      photoId: l.photo_id,
      position: l.position,
      url: urls.get(l.photo_id) ?? null,
      publicPath: l.public_path,
    })),
  };
}

export function publicPhotoUrl(path: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- from the journal ----------

/** Opens a draft story from a journal entry, with the entry's photos. */
export async function storyFromJournal(entry: JournalEntry, authorId: string): Promise<Post> {
  const supabase = requireClient();
  const post = await createStory(entry.trip_id, authorId, {
    title: titleFromJournal(entry.body) || entry.location_name || "…",
    body: entry.body,
    placeLabel: entry.location_name,
    journalEntryId: entry.id,
    status: "draft",
    visibility: "family",
    publishAfter: null,
  });
  const { data: photos } = await supabase
    .from("photos")
    .select("id")
    .eq("journal_entry_id", entry.id)
    .order("created_at");
  if (photos && photos.length) await setStoryPhotos(post.id, photos.map((p) => p.id));
  return post;
}

/** Waiting for a parent: the number on the "עוד" tile. */
export async function countPendingStories(tripId: string): Promise<number> {
  const { count } = await requireClient()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("status", "pending");
  return count ?? 0;
}
