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
import { audienceOptions, fromLocalInput, toLocalInput } from "@/lib/stories";
import { strings } from "@/lib/strings";
import type { Member, Post, PostVisibility, Trip } from "@/lib/types";

type Picked = { id: string; url: string | null };

const AUDIENCE_LABEL: Record<PostVisibility, string> = {
  family: strings.stories.audienceFamily,
  guests: strings.stories.audienceGuests,
  public: strings.stories.audiencePublic,
};
const AUDIENCE_HINT: Record<PostVisibility, string> = {
  family: strings.stories.audienceFamilyHint,
  guests: strings.stories.audienceGuestsHint,
  public: strings.stories.audiencePublicHint,
};

/**
 * Write or edit a story. A parent publishes (choosing the audience); a kid
 * saves a draft or sends it for approval, and never sees the audience at all
 * - posts_guard would ignore it anyway (00043).
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
  /** Role of the story's author (a parent may edit a kid's story). */
  authorRole: string | undefined;
  existing: Story | null;
  initialPlace: string | null;
  onClose: () => void;
  onSaved: (post: Post, published: boolean) => void;
  onToast: (message: string) => void;
}) {
  const isOwner = member.role === "owner";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [place, setPlace] = useState(existing?.place_label ?? initialPlace ?? "");
  const [photos, setPhotos] = useState<Picked[]>(
    existing?.photos.map((p) => ({ id: p.photoId, url: p.url })) ?? []
  );
  const [audience, setAudience] = useState<PostVisibility>(existing?.visibility ?? "guests");
  const [later, setLater] = useState(Boolean(existing?.publish_after));
  const [publishAfter, setPublishAfter] = useState(toLocalInput(existing?.publish_after ?? null));
  const [sharePhotos, setSharePhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const options = audienceOptions(authorRole);

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

  async function save(status: "draft" | "pending" | "approved") {
    if (busy) return;
    if (!title.trim()) {
      onToast(strings.stories.titleRequired);
      return;
    }
    setBusy(true);
    try {
      const fields = {
        title,
        body,
        placeLabel: place || null,
        status,
        // kids never choose an audience; parents do, and only from what the
        // author's role allows
        ...(isOwner
          ? {
              visibility: options.includes(audience) ? audience : ("family" as const),
              publishAfter: later ? fromLocalInput(publishAfter) : null,
            }
          : {}),
      };
      const post = existing
        ? await updateStory(existing.id, fields)
        : await createStory(trip.id, member.id, {
            visibility: "family",
            publishAfter: null,
            ...fields,
          });
      await setStoryPhotos(post.id, photos.map((p) => p.id));
      if (isOwner && status === "approved" && sharePhotos && post.visibility !== "family") {
        await shareStoryPhotos(photos.map((p) => p.id), member.id);
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

  return (
    <Sheet open onClose={onClose} title={existing ? strings.stories.editTitle : strings.stories.composerTitle}>
      <div className="space-y-4">
        <div>
          <label htmlFor="story-title" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.stories.titleLabel}
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
          <label htmlFor="story-body" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.stories.bodyLabel}
          </label>
          <textarea
            id="story-body"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={strings.stories.bodyPlaceholder}
            className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="story-place" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.stories.placeLabel}
          </label>
          <input
            id="story-place"
            type="text"
            maxLength={80}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink-soft">{strings.stories.placeHint}</p>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">{strings.stories.photosLabel}</legend>
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
                    aria-label={strings.stories.removePhoto}
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
              {uploading ? strings.photos.uploading : strings.stories.addPhotos}
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
              <PhotosIcon className="h-4 w-4" /> {strings.stories.fromGallery}
            </button>
          </div>
        </fieldset>

        {isOwner && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-ink-soft">{strings.stories.audienceLabel}</legend>
            <div role="radiogroup" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={audience === o}
                  onClick={() => setAudience(o)}
                  className={`rounded-xl border py-2.5 text-sm font-semibold ${
                    audience === o ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  {AUDIENCE_LABEL[o]}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft">{AUDIENCE_HINT[audience]}</p>
            {authorRole !== "owner" && <p className="text-xs text-ink-soft">{strings.stories.publicKidBlocked}</p>}

            {audience !== "family" && (
              <>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={sharePhotos}
                    onChange={(e) => setSharePhotos(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-sea)]"
                  />
                  {strings.stories.sharePhotos}
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={later}
                    onChange={(e) => setLater(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-sea)]"
                  />
                  {strings.stories.publishAfter}
                </label>
                {later && (
                  <div>
                    <label htmlFor="story-after" className="mb-1 block text-sm font-medium text-ink-soft">
                      {strings.stories.publishAfterLabel}
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
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => void save("draft")}
            className="rounded-xl border border-line py-3 font-semibold text-ink-soft disabled:opacity-60"
          >
            {strings.stories.saveDraft}
          </button>
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => void save(isOwner ? "approved" : "pending")}
            className="rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
          >
            {isOwner ? strings.stories.publish : strings.stories.sendForApproval}
          </button>
        </div>
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
    <Sheet open onClose={onClose} title={strings.stories.galleryTitle}>
      {photos === null ? (
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      ) : photos.length === 0 ? (
        <p className="text-center text-sm text-ink-soft">{strings.stories.galleryEmpty}</p>
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
        {strings.stories.galleryDone}
      </button>
    </Sheet>
  );
}
