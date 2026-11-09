"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Banner } from "@/components/ui/Banner";
import { askConfirm } from "@/components/ConfirmSheet";
import { LoadFailed } from "@/components/LoadFailed";
import {
  createAlbum,
  deleteAlbum,
  loadAlbumNews,
  markAlbumSeen,
  renameAlbum,
  setAlbumShared,
  type Album,
} from "@/lib/data/albums";
import { setPhotoShared } from "@/lib/data/photos";
import { strings } from "@/lib/strings";
import { failureText } from "@/lib/failureText";
import { EyeIcon, HeartIcon, MessagesIcon } from "@/components/icons";
import { NewDot } from "@/components/feedback/FeedbackCount";

// Albums by theme (00087, DECISIONS #58). A photo uploaded into an album
// belongs to it only, so the "vibe" photos never crowd the place grid or the
// updates. Parents create, rename, share and delete albums; parents and kids
// upload into them (a kid's photo waits for a parent). A parent's upload into
// a shared album is shared at once - the button says so (the rule 3 step).
// Guests read shared albums, with "new" since they last opened each one.

export type AlbumViewPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  album_id: string | null;
  /** family rows only; a guest's photos are all approved and shared */
  status?: "pending" | "approved" | "rejected";
  shared_with_guests?: boolean;
};

/** One photo's numbers. views: guests who opened it (00085), null for
 *  anyone but a parent, who alone may see them (#57). */
export type AlbumPhotoStats = { views: number | null; comments: number; likes: number; isNew: boolean };

/** 👁 3 · 💬 2 · ❤ 1 under a photo, zeros included. */
function StatsRow({ stats }: { stats: AlbumPhotoStats }) {
  return (
    <span
      role="img"
      aria-label={strings.albums.statsLabel(stats.views, stats.comments, stats.likes)}
      className="flex items-center gap-2.5 text-xs font-semibold text-ink-soft"
    >
      {stats.views !== null && (
        <span className="inline-flex items-center gap-0.5">
          <EyeIcon className="h-3.5 w-3.5" />
          {stats.views}
        </span>
      )}
      <span className="inline-flex items-center gap-0.5">
        <MessagesIcon className="h-3.5 w-3.5" />
        {stats.comments}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <HeartIcon className="h-3.5 w-3.5" />
        {stats.likes}
      </span>
      {stats.isNew && <NewDot />}
    </span>
  );
}

export function AlbumsView<P extends AlbumViewPhoto>({
  tripId,
  memberId,
  role,
  photos,
  tile,
  stats,
  initialAlbumId,
  onUpload,
  onPhotosChanged,
  onToast,
}: {
  tripId: string;
  memberId: string;
  role: "owner" | "kid" | "guest";
  /** the album photos the caller may see, newest first */
  photos: P[];
  tile: (photo: P) => React.ReactNode;
  /** views (parents), comments and likes of one photo */
  stats: (photoId: string) => AlbumPhotoStats;
  /** open this album straight away (the home's "new" line links here) */
  initialAlbumId?: string | null;
  /** family only: uploads into the album and returns how many went up */
  onUpload?: (files: File[], album: Album) => Promise<number>;
  /** reload the photos after a share or a delete */
  onPhotosChanged?: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const isOwner = role === "owner";
  const [albums, setAlbums] = useState<Album[]>([]);
  const [fresh, setFresh] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialAlbumId ?? null);
  const [nameSheet, setNameSheet] = useState<{ mode: "create" } | { mode: "rename"; album: Album } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    const news = await loadAlbumNews(tripId, memberId);
    setAlbums(news.albums);
    setFresh(news.fresh);
  }, [tripId, memberId]);

  useEffect(() => {
    let cancelled = false;
    void loadAlbumNews(tripId, memberId)
      .then((news) => {
        if (cancelled) return;
        setAlbums(news.albums);
        // opened straight from the home's line: it is seen now
        if (initialAlbumId) {
          news.fresh.delete(initialAlbumId);
          void markAlbumSeen(memberId, initialAlbumId).catch(() => {});
        }
        setFresh(news.fresh);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // the album to open is read once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, memberId]);

  // opening an album clears its "new" (feedback_seen on the album id)
  const openAlbum = useCallback(
    (id: string) => {
      setOpenId(id);
      setFresh((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      void markAlbumSeen(memberId, id).catch(() => {});
    },
    [memberId]
  );

  const run = useCallback(
    async (action: () => Promise<void>, done?: string) => {
      try {
        await action();
        await reload();
        await onPhotosChanged?.();
        if (done) onToast(done);
      } catch {
        onToast(failureText());
      }
    },
    [reload, onPhotosChanged, onToast]
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

  const photosOf = (albumId: string) => photos.filter((p) => p.album_id === albumId);
  const open = albums.find((a) => a.id === openId) ?? null;

  if (open) {
    const items = photosOf(open.id);
    const unshared = items.filter((p) => p.status === "approved" && p.shared_with_guests === false);
    return (
      <section className="space-y-3">
        <button type="button" onClick={() => setOpenId(null)} className="text-sm font-semibold text-sea">
          {strings.albums.back}
        </button>
        <header className="space-y-2">
          <h2 className="text-lg font-bold text-ink" dir="auto">
            {open.name}
          </h2>
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

        {/* rule 3: photos uploaded while the album was private stay unshared */}
        {isOwner && open.shared_with_guests && unshared.length > 0 && (
          <Banner
            tone="info"
            action={
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    for (const p of unshared) await setPhotoShared(p.id, true);
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

        {onUpload && (
          <div className="space-y-1">
            <label
              aria-busy={uploading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl bg-sea py-3 text-sm font-bold text-on-sea ${uploading ? "opacity-70" : "cursor-pointer"}`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                className="sr-only"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length === 0 || uploading) return;
                  setUploading(true);
                  try {
                    const n = await onUpload(files, open);
                    onToast(isOwner ? strings.albums.uploaded(n) : strings.photos.uploaded);
                  } catch {
                    onToast(failureText());
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              {uploading ? strings.photos.uploading : isOwner && open.shared_with_guests ? strings.albums.uploadShare : strings.albums.upload}
            </label>
            <p className="px-1 text-xs text-ink-soft">
              {!isOwner
                ? strings.albums.kidUploadHint
                : open.shared_with_guests
                  ? strings.albums.uploadShareHint
                  : strings.albums.uploadPrivateHint}
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
            {strings.albums.albumEmpty}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {items.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                {tile(photo)}
                <div className="space-y-1 p-2 text-xs">
                  <StatsRow stats={stats(photo.id)} />
                  {photo.status === "pending" ? (
                    <span className="inline-block rounded-full bg-sun-tint px-2 py-0.5 font-semibold text-sun-deep">
                      {strings.photos.pending}
                    </span>
                  ) : (
                    isOwner &&
                    open.shared_with_guests &&
                    photo.status === "approved" &&
                    !photo.shared_with_guests && <span className="block text-ink-soft">{strings.albums.notShared}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
          openAlbum(album.id);
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
            const cover = items.find((p) => p.url)?.url ?? null;
            const n = fresh.get(album.id) ?? 0;
            // the album's totals: views are guest x photo openings (parents only)
            const totals = items.reduce(
              (t, p) => {
                const st = stats(p.id);
                return {
                  views: st.views === null || t.views === null ? null : t.views + st.views,
                  comments: t.comments + st.comments,
                  likes: t.likes + st.likes,
                };
              },
              { views: isOwner ? 0 : null, comments: 0, likes: 0 } as { views: number | null; comments: number; likes: number }
            );
            return (
              <li key={album.id}>
                <button
                  type="button"
                  onClick={() => openAlbum(album.id)}
                  className="relative block w-full overflow-hidden rounded-2xl border border-line bg-surface text-start shadow-sm"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img src={cover} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="block aspect-square w-full bg-paper-deep" />
                  )}
                  {n > 0 && (
                    <span className="absolute top-1.5 start-1.5 rounded-full bg-alert px-2 py-0.5 text-xs font-extrabold text-on-alert">
                      {strings.albums.fresh(n)}
                    </span>
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
                    <span className="block text-xs text-ink-soft">
                      {[
                        ...(totals.views !== null ? [strings.albums.cardViews(totals.views)] : []),
                        strings.albums.cardComments(totals.comments),
                        strings.albums.cardLikes(totals.likes),
                      ].join(" · ")}
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
