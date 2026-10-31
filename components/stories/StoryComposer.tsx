"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { CameraIcon, CheckIcon, CloseIcon, PhotosIcon } from "@/components/icons";
import { listPhotos, uploadPhoto, type PhotoWithUrl } from "@/lib/data/photos";
import {
  createStory,
  reloadStory,
  setStoryPhotos,
  shareStoryPhotos,
  syncPublicCopies,
  updateStory,
  type Story,
} from "@/lib/data/stories";
import { createJournalEntryOrQueue } from "@/lib/data/journal";
import { AudienceRow } from "@/components/AudienceSheet";
import { audienceOptions, fromLocalInput, toLocalInput } from "@/lib/stories";
import { strings } from "@/lib/strings";
import type { Member, Post, PostVisibility, Trip } from "@/lib/types";

type Picked = { id: string; url: string | null };

export const MOODS = ["🤩", "😀", "🙂", "😐", "🙁", "😴"];

const s = strings.stories;

/** What the author chose, in the words of their own role. */
function audienceText(o: PostVisibility, kid: boolean): { label: string; hint: string } {
  if (o === "family") {
    return kid
      ? { label: s.audienceFamilyKid, hint: s.audienceFamilyKidHint }
      : { label: s.audienceFamily, hint: s.audienceFamilyHint };
  }
  if (o === "guests") {
    return { label: s.audienceGuests, hint: kid ? s.audienceGuestsKidHint : s.audienceGuestsHint };
  }
  return { label: s.audiencePublic, hint: s.audiencePublicHint };
}

/**
 * Write or edit an entry in the journal (00078: the journal and the stories
 * are one feed). One question decides where it goes - "מי רואה?":
 *
 *   family  saved at once, for a kid too (posts_guard: no gate for the family)
 *   guests  a parent publishes; a kid's entry is sent to a parent (pending)
 *   public  a parent's own entry only, and it needs a title (00046/00078)
 *
 * Title, place and the publishing details wait under "אפשרויות נוספות".
 */
export function StoryComposer({
  trip,
  member,
  authorRole,
  existing,
  initialPlace,
  onClose,
  onSaved,
  onToast,
}: {
  trip: Trip;
  member: Member;
  /** Role of the entry's author (a parent may edit a kid's entry). */
  authorRole: string | undefined;
  existing: Story | null;
  initialPlace: string | null;
  onClose: () => void;
  /** `post` is null when the entry waits offline in the queue. */
  onSaved: (post: Post | null, published: boolean) => void;
  onToast: (message: string) => void;
}) {
  const isOwner = member.role === "owner";
  const isKid = member.role === "kid";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [mood, setMood] = useState<string | null>(existing?.mood ?? null);
  const [place, setPlace] = useState(existing?.place_label ?? initialPlace ?? "");
  const [photos, setPhotos] = useState<Picked[]>(
    existing?.photos.map((p) => ({ id: p.photoId, url: p.url })) ?? []
  );
  // a kid's entry waiting for a parent is one the kid asked to share
  const [audience, setAudience] = useState<PostVisibility>(
    existing ? (existing.status === "pending" ? "guests" : existing.visibility) : "family"
  );
  // which guest groups, when the audience is guests (00063): [] = every guest
  const [groups, setGroups] = useState<string[]>(existing?.audience ?? []);
  const [later, setLater] = useState(Boolean(existing?.publish_after));
  const [publishAfter, setPublishAfter] = useState(toLocalInput(existing?.publish_after ?? null));
  const [sharePhotos, setSharePhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const options = audienceOptions(authorRole);
  const choice = audienceText(audience, isKid);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const photo = await uploadPhoto({
          tripId: trip.id,
          memberId: member.id,
          isOwner,
          file,
        });
        setPhotos((prev) => [...prev, { id: photo.id, url: URL.createObjectURL(file) }]);
      }
    } catch {
      onToast(strings.common.error);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (busy) return;
    if (!body.trim() && photos.length === 0) {
      onToast(s.bodyRequired);
      return;
    }
    if (audience === "public" && !title.trim()) {
      onToast(s.publicNeedsTitle);
      return;
    }
    // a parent publishes; a kid saves for the family, or asks a parent
    const status = isOwner || audience === "family" ? "approved" : "pending";
    setBusy(true);
    try {
      const fields = {
        title: title || null,
        body,
        mood,
        placeLabel: place || null,
        status,
        // which groups: anyone writing suggests them (00064), a parent's
        // publish decides
        audience: audience === "guests" ? groups : [],
        ...(isOwner
          ? {
              visibility: options.includes(audience) ? audience : ("family" as const),
              publishAfter: later && audience !== "family" ? fromLocalInput(publishAfter) : null,
            }
          : {}),
      } as const;

      // A family line with no photos still saves with no signal: it waits in
      // the offline queue (F10), as the journal always did.
      if (!existing && audience === "family" && photos.length === 0 && !title.trim()) {
        const result = await createJournalEntryOrQueue({
          tripId: trip.id,
          authorId: member.id,
          body,
          mood,
          locationName: place || null,
        });
        if (result === "queued") {
          onToast(strings.journal.queued);
          onSaved(null, false);
          return;
        }
        onSaved(result, true);
        return;
      }

      const post = existing
        ? await updateStory(existing.id, fields)
        : await createStory(trip.id, member.id, {
            visibility: "family",
            publishAfter: null,
            ...fields,
          });
      await setStoryPhotos(post.id, photos.map((p) => p.id));
      if (isOwner && post.status === "approved" && sharePhotos && post.visibility !== "family") {
        await shareStoryPhotos(photos.map((p) => p.id), member.id, post.audience);
      }
      if (isOwner) {
        const fresh = await reloadStory(post.id, member.role);
        if (fresh) await syncPublicCopies(fresh);
      }
      onSaved(post, post.status === "approved");
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  const action =
    audience === "family" ? s.publish : isOwner ? s.publishShare : s.sendForApproval;

  return (
    <Sheet open onClose={onClose} title={existing ? s.editTitle : s.composerTitle}>
      <div className="space-y-4">
        <div>
          <label htmlFor="story-body" className="mb-1 block text-sm font-medium text-ink-soft">
            {existing ? s.bodyLabel : strings.journal.prompt}
          </label>
          <textarea
            id="story-body"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={s.bodyPlaceholder}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
          <div className="mt-1 flex gap-0.5" role="radiogroup" aria-label={strings.journal.mood}>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mood === m}
                onClick={() => setMood(mood === m ? null : m)}
                className={`grid h-11 w-11 place-items-center rounded-full text-xl leading-none transition-opacity ${
                  mood === m ? "bg-sun-tint" : "opacity-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">{s.photosLabel}</legend>
          {photos.length > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-paper-deep">
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- signed / object URL
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                    aria-label={s.removePhoto}
                    className="absolute end-1 top-1 grid place-items-center rounded-full bg-ink/70 text-paper"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm font-semibold text-ink-soft">
              <CameraIcon className="h-4 w-4" />
              {uploading ? strings.photos.uploading : s.addPhotos}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm font-semibold text-ink-soft"
            >
              <PhotosIcon className="h-4 w-4" /> {s.fromGallery}
            </button>
          </div>
        </fieldset>

        {/* the one question that decides where the entry goes */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink-soft">{s.audienceLabel}</legend>
          <div
            role="radiogroup"
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
          >
            {options.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={audience === o}
                onClick={() => setAudience(o)}
                className={`min-h-[44px] rounded-xl border px-1 py-2 text-sm font-semibold ${
                  audience === o ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink-soft"
                }`}
              >
                {audienceText(o, isKid).label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-soft">{choice.hint}</p>
          {audience === "guests" && <AudienceRow value={groups} onChange={setGroups} />}
          {isOwner && authorRole !== "owner" && <p className="text-xs text-ink-soft">{s.publicKidBlocked}</p>}
        </fieldset>

        <details className="rounded-xl border border-line px-3 py-2" open={Boolean(existing?.title) || audience === "public"}>
          <summary className="cursor-pointer py-1 text-sm font-semibold text-ink-soft">{s.more}</summary>
          <div className="space-y-3 pt-2">
            <div>
              <label htmlFor="story-title" className="mb-1 block text-sm font-medium text-ink-soft">
                {s.titleLabel}
              </label>
              <input
                id="story-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="story-place" className="mb-1 block text-sm font-medium text-ink-soft">
                {s.placeLabel}
              </label>
              <input
                id="story-place"
                type="text"
                maxLength={80}
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
              />
              <p className="mt-1 text-xs text-ink-soft">{s.placeHint}</p>
            </div>
            {isOwner && audience !== "family" && (
              <>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={sharePhotos}
                    onChange={(e) => setSharePhotos(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-sea)]"
                  />
                  {s.sharePhotos}
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={later}
                    onChange={(e) => setLater(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-sea)]"
                  />
                  {s.publishAfter}
                </label>
                {later && (
                  <div>
                    <label htmlFor="story-after" className="mb-1 block text-sm font-medium text-ink-soft">
                      {s.publishAfterLabel}
                    </label>
                    <input
                      id="story-after"
                      type="datetime-local"
                      value={publishAfter}
                      onChange={(e) => setPublishAfter(e.target.value)}
                      className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
                      dir="ltr"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </details>

        <button
          type="button"
          disabled={busy || uploading}
          onClick={() => void save()}
          className="min-h-[48px] w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {action}
        </button>
      </div>

      {galleryOpen && (
        <GalleryPicker
          tripId={trip.id}
          selected={photos.map((p) => p.id)}
          onDone={(picked) => {
            setPhotos((prev) => {
              const kept = prev.filter((p) => picked.some((x) => x.id === p.id));
              const added = picked.filter((x) => !prev.some((p) => p.id === x.id));
              return [...kept, ...added];
            });
            setGalleryOpen(false);
          }}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </Sheet>
  );
}

function GalleryPicker({
  tripId,
  selected,
  onDone,
  onClose,
}: {
  tripId: string;
  selected: string[];
  onDone: (picked: Picked[]) => void;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<PhotoWithUrl[] | null>(null);
  const [picked, setPicked] = useState<string[]>(selected);

  useEffect(() => {
    let cancelled = false;
    void listPhotos(tripId)
      .then((all) => {
        if (!cancelled) setPhotos(all.filter((p) => p.status !== "rejected"));
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return (
    <Sheet open onClose={onClose} title={s.galleryTitle}>
      {photos === null ? (
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      ) : photos.length === 0 ? (
        <p className="text-center text-sm text-ink-soft">{s.galleryEmpty}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={p.caption ?? p.taken_on}
                  onClick={() => setPicked((prev) => (on ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                  className={`relative block aspect-square w-full overflow-hidden rounded-xl ${on ? "ring-4 ring-sea" : ""}`}
                >
                  {p.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  )}
                  {on && (
                    <span className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-sea text-on-sea">
                      <CheckIcon className="h-4 w-4" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() =>
          onDone(picked.map((id) => ({ id, url: photos?.find((p) => p.id === id)?.url ?? null })))
        }
        className="mt-4 w-full rounded-xl bg-sea py-3 font-semibold text-on-sea"
      >
        {s.galleryDone}
      </button>
    </Sheet>
  );
}
