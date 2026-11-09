"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Banner } from "@/components/ui/Banner";
import { FabPicker } from "@/components/ui/Fab";
import { askConfirm } from "@/components/ConfirmSheet";
import { CheckIcon } from "@/components/icons";
import { LoadFailed } from "@/components/LoadFailed";
import {
  addToAlbum,
  createAlbum,
  deleteAlbum,
  listAlbums,
  removeFromAlbum,
  renameAlbum,
  setAlbumShared,
  type Album,
  type AlbumPhoto,
} from "@/lib/data/albums";
import { setPhotoShared } from "@/lib/data/photos";
import { strings } from "@/lib/strings";
import { failureText } from "@/lib/failureText";

// Albums by theme (00087, DECISIONS #58): a second way into the same photos.
// Parents create, rename, share and delete albums; parents and kids add
// photos (an upload here is an ordinary upload - a kid's waits for a parent -
// and then joins the album). Guests read shared albums, and in them only the
// photos RLS already shows them (rule 3): this screen never shares a photo
// unless a parent taps "שיתוף שלהן".

export type AlbumViewPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  /** family rows only; a guest's photos are all approved and shared */
  status?: "pending" | "approved" | "rejected";
  shared_with_guests?: boolean;
};

export function AlbumsView<P extends AlbumViewPhoto>({
  tripId,
  memberId,
  role,
  photos,
  tile,
  onUpload,
  onPhotosChanged,
  onToast,
}: {
  tripId: string;
  memberId: string;
  role: "owner" | "kid" | "guest";
  /** every photo the caller may see, newest first */
  photos: P[];
  tile: (photo: P) => React.ReactNode;
  /** family only: uploads and returns the new photo ids */
  onUpload?: (files: File[]) => Promise<string[]>;
  /** family only: reload the photos after a share */
  onPhotosChanged?: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const isOwner = role === "owner";
  const [albums, setAlbums] = useState<Album[]>([]);
  const [links, setLinks] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nameSheet, setNameSheet] = useState<{ mode: "create" } | { mode: "rename"; album: Album } | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    const result = await listAlbums(tripId);
    setAlbums(result.albums);
    setLinks(result.links);
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    void listAlbums(tripId)
      .then((r) => {
        if (cancelled) return;
        setAlbums(r.albums);
        setLinks(r.links);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const run = useCallback(
    async (action: () => Promise<void>, done?: string) => {
      try {
        await action();
        await reload();
        if (done) onToast(done);
      } catch {
        onToast(failureText());
      }
    },
    [reload, onToast]
  );

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  // an album's photos in the order they were added, newest first; a link to
  // a photo this screen does not show (rejected, or filtered by role) is skipped
  const photosOf = useCallback(
    (albumId: string) =>
      links
        .filter((l) => l.album_id === albumId)
        .map((l) => ({ link: l, photo: photoById.get(l.photo_id) }))
        .filter((x): x is { link: AlbumPhoto; photo: P } => x.photo !== undefined),
    [links, photoById]
  );

  if (loading) return <p className="text-center text-ink-soft">{strings.common.loading}</p>;
  if (failed) {
    return (
      <LoadFailed
        onRetry={async () => {
          try {
            await reload();
            setFailed(false);
          } catch {
            // the card stays
          }
        }}
      />
    );
  }

  const open = albums.find((a) => a.id === openId) ?? null;

  if (open) {
    const items = photosOf(open.id);
    const inAlbum = new Set(items.map((x) => x.photo.id));
    const unshared = items.filter((x) => x.photo.status === "approved" && x.photo.shared_with_guests === false);
    const pendingCount = items.filter((x) => x.photo.status === "pending").length;
    return (
      <section className="space-y-3">
        <button type="button" onClick={() => setOpenId(null)} className="text-sm font-semibold text-sea">
          {strings.albums.back}
        </button>
        <header className="space-y-2">
          <h2 className="text-lg font-bold text-ink">{open.name}</h2>
          <p className="text-xs text-ink-soft">{strings.albums.count(items.length)}</p>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-1.5 font-semibold text-ink-soft">
                <input
                  type="checkbox"
                  checked={open.shared_with_guests}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAlbums((prev) => prev.map((a) => (a.id === open.id ? { ...a, shared_with_guests: next } : a)));
                    void setAlbumShared(open.id, next).catch(() => {
                      onToast(strings.common.error);
                      void reload().catch(() => {});
                    });
                  }}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {strings.albums.shareToggle}
              </label>
              <button type="button" onClick={() => setNameSheet({ mode: "rename", album: open })} className="font-semibold text-sea">
                {strings.albums.rename}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!(await askConfirm(strings.albums.deleteConfirm))) return;
                  setOpenId(null);
                  void run(() => deleteAlbum(open.id), strings.albums.deleted);
                }}
                className="font-semibold text-alert"
              >
                {strings.albums.deleteAlbum}
              </button>
            </div>
          )}
        </header>

        {/* rule 3: a shared album shows guests only photos shared on their own */}
        {isOwner && open.shared_with_guests && unshared.length > 0 && (
          <Banner
            tone="info"
            action={
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    for (const x of unshared) await setPhotoShared(x.photo.id, true);
                    await onPhotosChanged?.();
                  }, strings.albums.sharedThem)
                }
                className="rounded-xl bg-sea px-3 py-1.5 text-xs font-bold text-on-sea"
              >
                {strings.albums.shareThem}
              </button>
            }
          >
            {strings.albums.unsharedPhotos(unshared.length)}
          </Banner>
        )}
        {isOwner && open.shared_with_guests && pendingCount > 0 && (
          <p className="text-xs text-ink-soft">{strings.albums.pendingHint}</p>
        )}

        {role !== "guest" && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-bold text-sea"
          >
            {strings.albums.addExisting}
          </button>
        )}

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
            {strings.albums.albumEmpty}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {items.map(({ link, photo }) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                {tile(photo)}
                {(photo.status === "pending" || isOwner || (role === "kid" && link.added_by === memberId)) && (
                  <div className="space-y-1 p-2 text-xs">
                    {photo.status === "pending" && (
                      <span className="inline-block rounded-full bg-sun-tint px-2 py-0.5 font-semibold text-sun-deep">
                        {strings.photos.pending}
                      </span>
                    )}
                    {isOwner && open.shared_with_guests && photo.status === "approved" && !photo.shared_with_guests && (
                      <span className="block text-ink-soft">{strings.albums.notShared}</span>
                    )}
                    {(isOwner || (role === "kid" && link.added_by === memberId)) && (
                      <button
                        type="button"
                        onClick={() => void run(() => removeFromAlbum(open.id, photo.id), strings.albums.removed)}
                        className="block font-semibold text-alert"
                      >
                        {strings.albums.remove}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {picking && (
          <PickSheet
            photos={photos.filter((p) => !inAlbum.has(p.id) && p.url)}
            onClose={() => setPicking(false)}
            onPick={(ids) => {
              setPicking(false);
              void run(() => addToAlbum(open.id, ids, memberId), strings.albums.added);
            }}
          />
        )}
        {onUpload && (
          <FabPicker
            label={strings.albums.upload}
            accept="image/*"
            multiple
            busy={uploading}
            onFiles={async (files) => {
              if (uploading) return;
              setUploading(true);
              try {
                const ids = await onUpload(files);
                await addToAlbum(open.id, ids, memberId);
                await reload();
                onToast(isOwner ? strings.albums.added : strings.photos.uploaded);
              } catch {
                onToast(failureText());
                await reload().catch(() => {});
              } finally {
                setUploading(false);
              }
            }}
          />
        )}
        <NameSheet state={nameSheet} onClose={() => setNameSheet(null)} onSave={saveName} />
      </section>
    );
  }

  function saveName(name: string) {
    const state = nameSheet;
    setNameSheet(null);
    if (!state) return;
    if (state.mode === "create") {
      void (async () => {
        try {
          const album = await createAlbum({ tripId, memberId, name });
          await reload();
          setOpenId(album.id);
          onToast(strings.albums.created);
        } catch {
          onToast(failureText());
        }
      })();
    } else {
      void run(() => renameAlbum(state.album.id, name), strings.albums.renamed);
    }
  }

  return (
    <section className="space-y-3">
      {isOwner && (
        <button
          type="button"
          onClick={() => setNameSheet({ mode: "create" })}
          className="w-full rounded-xl bg-sea py-2.5 text-sm font-bold text-on-sea"
        >
          + {strings.albums.newAlbum}
        </button>
      )}
      {albums.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
          <p>{strings.albums.empty}</p>
          {role !== "guest" && <p className="mt-2 text-xs">{strings.albums.emptyHint}</p>}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {albums.map((album) => {
            const items = photosOf(album.id);
            const cover = items.find((x) => x.photo.url)?.photo.url ?? null;
            return (
              <li key={album.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(album.id)}
                  className="block w-full overflow-hidden rounded-2xl border border-line bg-surface text-start shadow-sm"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img src={cover} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="block aspect-square w-full bg-paper-deep" />
                  )}
                  <span className="block space-y-0.5 p-2">
                    <span className="block truncate text-sm font-bold text-ink" dir="auto">
                      {album.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                      {strings.albums.count(items.length)}
                      {isOwner && album.shared_with_guests && (
                        <span className="rounded-full bg-sea-tint px-1.5 py-0.5 font-semibold text-sea">
                          {strings.albums.sharedChip}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <NameSheet state={nameSheet} onClose={() => setNameSheet(null)} onSave={saveName} />
    </section>
  );
}

function NameSheet({
  state,
  onClose,
  onSave,
}: {
  state: { mode: "create" } | { mode: "rename"; album: Album } | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  return (
    <Sheet
      open={state !== null}
      onClose={onClose}
      title={state?.mode === "rename" ? strings.albums.rename : strings.albums.newAlbum}
    >
      {/* mounted per opening, so the draft starts from the current name */}
      {state && <NameForm initial={state.mode === "rename" ? state.album.name : ""} onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

function NameForm({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(name);
      }}
    >
      <label className="block space-y-1 text-sm font-semibold text-ink">
        <span>{strings.albums.nameLabel}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={strings.albums.namePlaceholder}
          maxLength={60}
          dir="auto"
          autoFocus
          className="block w-full rounded-xl border border-line bg-surface p-3 text-base font-normal text-ink"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!ok} className="flex-1 rounded-xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60">
          {initial ? strings.common.save : strings.albums.create}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-3 font-semibold text-ink-soft">
          {strings.common.cancel}
        </button>
      </div>
    </form>
  );
}

/** Pick photos already in the app to add to the album. */
function PickSheet({
  photos,
  onClose,
  onPick,
}: {
  photos: AlbumViewPhoto[];
  onClose: () => void;
  onPick: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <Sheet open onClose={onClose} title={strings.albums.pickTitle}>
      {photos.length === 0 ? (
        <p className="p-4 text-center text-sm text-ink-soft">{strings.albums.noneToPick}</p>
      ) : (
        <div className="space-y-3">
          <ul className="grid grid-cols-3 gap-1.5">
            {photos.map((photo) => {
              const on = picked.has(photo.id);
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={photo.caption ?? strings.photos.open}
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(photo.id);
                        else next.add(photo.id);
                        return next;
                      })
                    }
                    className={`relative block w-full overflow-hidden rounded-xl ${on ? "ring-4 ring-sea" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                    <img src={photo.url ?? ""} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    {on && (
                      <span className="absolute top-1 end-1 rounded-full bg-sea p-1 text-on-sea">
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => onPick([...picked])}
            className="sticky bottom-0 w-full rounded-xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60"
          >
            {strings.albums.addPicked(picked.size)}
          </button>
        </div>
      )}
    </Sheet>
  );
}
