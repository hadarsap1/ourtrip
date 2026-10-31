"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  listGuestGooglePhotos,
  listGuestPhotos,
  type GuestGooglePhoto,
  type GuestPhoto,
} from "@/lib/data/guests";
import {
  approvePhoto,
  deletePhoto,
  listPhotos,
  rejectPhoto,
  setPhotoAudience,
  setPhotoShared,
  updatePhotoCaption,
  type PhotoWithUrl,
} from "@/lib/data/photos";
import { formatDate } from "@/lib/format";
import { CheckIcon, CloseIcon, MessagesIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Trip } from "@/lib/types";
import { GooglePhotosSection } from "./GooglePhotosSection";
import { AudienceSheet } from "@/components/AudienceSheet";
import { listMyGroups } from "@/lib/data/groups";
import { CaptionSheet, PhotoCaption } from "./PhotoCaption";
import { PhotoView, type ViewedPhoto } from "./PhotoView";
import { usePhotoFeedback } from "./usePhotoFeedback";

/** The bottom bar has no photos tab: the way back is to the updates. */
function BackToUpdates() {
  return (
    <Link href="/stories" className="flex min-h-11 shrink-0 items-center text-sm font-bold text-sea">
      {strings.photos.backToUpdates}
    </Link>
  );
}

export function PhotosScreen() {
  const { member } = useMember();
  if (member?.role === "guest") return <GuestPhotosView />;
  return <FamilyPhotosView />;
}

// Guest portal: approved+shared photos only, grouped by day (Sprint 7).
// Rows and URLs both come from the guest-photos Edge Function.
function GuestPhotosView() {
  const { member } = useMember();
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<GuestGooglePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const feedback = usePhotoFeedback(tripId);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listGuestPhotos().catch(() => [] as GuestPhoto[]),
      listGuestGooglePhotos().catch(() => [] as GuestGooglePhoto[]),
      getActiveTrip().catch(() => null),
    ])
      .then(([p, g, t]) => {
        if (!cancelled) {
          setPhotos(p);
          setGooglePhotos(g);
          setTripId(t?.id ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const byDay = new Map<string, GuestPhoto[]>();
  for (const photo of photos) {
    const list = byDay.get(photo.taken_on) ?? [];
    list.push(photo);
    byDay.set(photo.taken_on, list);
  }

  const byCountry = new Map<string, GuestGooglePhoto[]>();
  for (const photo of googlePhotos) {
    const key = photo.country || strings.googlePhotos.noGroup;
    const list = byCountry.get(key) ?? [];
    list.push(photo);
    byCountry.set(key, list);
  }

  const isEmpty = photos.length === 0 && googlePhotos.length === 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{strings.photos.title}</h1>
        <BackToUpdates />
      </header>
      {isEmpty && (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
          {strings.photos.empty}
        </p>
      )}

      {[...byDay.entries()].map(([day, dayPhotos]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">
            {formatDate(day)}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {dayPhotos.map((photo) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
              >
                <PhotoTile photo={photo} comments={feedback.commentCount(photo.id)} onOpen={() => setViewing(photo)} />
                {photo.caption && (
                  <div className="p-2">
                    <PhotoCaption text={photo.caption} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {googlePhotos.length > 0 && (
        <div className="space-y-3 border-t border-line pt-4">
          <h2 className="text-lg font-bold text-ink">
            {strings.googlePhotos.title}
          </h2>
          {[...byCountry.entries()].map(([countryName, list]) => (
            <section key={countryName}>
              <h3 className="mb-1.5 px-1 text-sm font-semibold text-ink-soft">
                {countryName}
              </h3>
              <ul className="grid grid-cols-3 gap-1.5">
                {list.map((photo) => (
                  <li
                    key={photo.id}
                    className="aspect-square overflow-hidden rounded-xl bg-paper-deep shadow-sm"
                  >
                    {photo.url && (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL
                      <img
                        src={photo.url}
                        alt={photo.filename ?? ""}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {viewing && tripId && member && (
        <PhotoView
          photo={viewing}
          tripId={tripId}
          member={member}
          members={feedback.members}
          reactions={feedback.reactions}
          comments={feedback.comments}
          onChanged={() => void feedback.reload()}
          onToast={setToast}
          onClose={() => setViewing(null)}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}

function FamilyPhotosView() {
  const { member } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // guest groups (00063): a parent can limit a shared photo to some of them
  const [groups, setGroups] = useState<string[]>([]);
  const [audienceFor, setAudienceFor] = useState<PhotoWithUrl | null>(null);
  const [captionFor, setCaptionFor] = useState<PhotoWithUrl | null>(null);
  // a tapped photo, open with its likes and comments (00077)
  const [viewing, setViewing] = useState<PhotoWithUrl | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setPhotos(await listPhotos(tripId));
  }, []);
  const feedback = usePhotoFeedback(trip?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const isOwnerRole = member?.role === "owner";
  useEffect(() => {
    if (!trip || !isOwnerRole) return;
    let cancelled = false;
    void listMyGroups("owner")
      .then((g) => !cancelled && setGroups(g))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip, isOwnerRole]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (!trip) return;
      try {
        await action();
        await refresh(trip.id);
      } catch {
        showToast(strings.common.error);
      }
    },
    [trip, refresh, showToast]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const isOwner = member?.role === "owner";
  const pending = photos.filter((p) => p.status === "pending");
  const visible = isOwner
    ? photos.filter((p) => p.status !== "pending")
    : photos.filter((p) => p.status !== "rejected" || p.uploaded_by === member?.id);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      {/* The full grid behind the updates (Hadar 31/10/2026): photos are added
          from "עדכון חדש" there; here they are approved, shared and browsed. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{strings.photos.title}</h1>
        <BackToUpdates />
      </header>

      {/* owner approval queue (kid uploads land here - DECISIONS #4) */}
      {isOwner && pending.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
          <h2 className="mb-2 px-1 text-sm font-bold text-amber-800">
            {strings.photos.approvalQueue} ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-xl bg-surface shadow-sm">
                {photo.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img src={photo.url} alt={photo.caption ?? ""} className="max-h-72 w-full object-cover" />
                )}
                {photo.caption && (
                  <div className="px-2 pt-2">
                    <PhotoCaption text={photo.caption} />
                  </div>
                )}
                <div className="flex gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => member && void run(() => approvePhoto(photo.id, member.id))}
                    className="flex-1 rounded-lg bg-sea py-2 text-sm font-bold text-on-sea"
                  >
                    <CheckIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                    {strings.photos.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => member && void run(() => rejectPhoto(photo.id, member.id))}
                    className="flex-1 rounded-lg bg-rose-100 py-2 text-sm font-bold text-rose-600"
                  >
                    <CloseIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                    {strings.photos.reject}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length === 0 && pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
          {strings.photos.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {visible.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
            >
              <PhotoTile photo={photo} comments={feedback.commentCount(photo.id)} onOpen={() => setViewing(photo)} />
              <div className="space-y-1 p-2 text-xs">
                {photo.caption && <PhotoCaption text={photo.caption} />}
                {/* the uploader or a parent; a kid's edit of an approved photo goes
                    back to a parent for approval (photos_guard_update, 00076) */}
                {(isOwner || photo.uploaded_by === member?.id) && (
                  <button
                    type="button"
                    onClick={() => setCaptionFor(photo)}
                    className="block text-start font-semibold text-sea"
                  >
                    {photo.caption ? strings.photos.editText : strings.photos.addText}
                  </button>
                )}
                {photo.status === "pending" && (
                  <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    {strings.photos.pending}
                  </span>
                )}
                {photo.status === "rejected" && (
                  <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-600">
                    {strings.photos.rejected}
                  </span>
                )}
                {isOwner && photo.status === "approved" && (
                  <label className="flex items-center gap-1.5 font-semibold text-ink-soft">
                    <input
                      type="checkbox"
                      checked={photo.shared_with_guests}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setPhotos((prev) =>
                          prev.map((x) =>
                            x.id === photo.id ? { ...x, shared_with_guests: next } : x
                          )
                        );
                        void setPhotoShared(photo.id, next).catch(() =>
                          showToast(strings.common.error)
                        );
                      }}
                      className="h-3.5 w-3.5 accent-[var(--brand)]"
                    />
                    {strings.photos.shareToggle}
                  </label>
                )}
                {isOwner && photo.status === "approved" && photo.shared_with_guests && groups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAudienceFor(photo)}
                    className="block text-start font-semibold text-sea underline"
                  >
                    {photo.audience.length > 0
                      ? strings.audience.onlyTo.replace("{to}", photo.audience.join(", "))
                      : strings.audience.allGuests}
                  </button>
                )}
                {!isOwner && photo.shared_with_guests && (
                  <span className="font-semibold text-sea">
                    {strings.photos.shared}
                  </span>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await askConfirm(strings.photos.deleteConfirm))) return;
                      void run(() => deletePhoto(photo));
                    }}
                    className="font-semibold text-rose-500"
                  >
                    {strings.common.delete}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Google Photos: owner imports, family (owner + kids) views */}
      {trip && (
        <div className="border-t border-line pt-4">
          <GooglePhotosSection tripId={trip.id} isOwner={isOwner} />
        </div>
      )}

      {audienceFor && (
        <AudienceSheet
          groups={groups}
          value={audienceFor.audience}
          onClose={() => setAudienceFor(null)}
          onSave={async (audience) => {
            const id = audienceFor.id;
            setAudienceFor(null);
            try {
              await setPhotoAudience(id, audience);
              setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, audience } : x)));
              showToast(strings.audience.saved);
            } catch {
              showToast(strings.common.error);
            }
          }}
        />
      )}
      {viewing && trip && member && (
        <PhotoView
          photo={viewing}
          tripId={trip.id}
          member={member}
          members={feedback.members}
          reactions={feedback.reactions}
          comments={feedback.comments}
          onChanged={() => void feedback.reload()}
          onToast={showToast}
          onClose={() => setViewing(null)}
        />
      )}
      <CaptionSheet
        open={captionFor !== null}
        title={strings.photos.textTitle}
        previewUrl={captionFor?.url}
        initial={captionFor?.caption ?? ""}
        submitLabel={strings.common.save}
        onClose={() => setCaptionFor(null)}
        onSubmit={async (text) => {
          if (!captionFor) return;
          const id = captionFor.id;
          const backToApproval =
            member?.role === "kid" && captionFor.status === "approved" && (text.trim() || null) !== captionFor.caption;
          setCaptionFor(null);
          try {
            await updatePhotoCaption(id, text);
            const caption = text.trim() || null;
            setPhotos((prev) =>
              prev.map((x) => (x.id === id ? { ...x, caption, ...(backToApproval ? { status: "pending" as const } : {}) } : x))
            );
            showToast(backToApproval ? strings.editText.backToApproval : strings.photos.textSaved);
          } catch {
            showToast(strings.common.error);
          }
        }}
      />
      <Toast message={toast} />
    </div>
  );
}

/** A photo in the grid: tap to open it with its likes and comments (00077). */
function PhotoTile({
  photo,
  comments,
  onOpen,
}: {
  photo: { url: string | null; caption: string | null };
  comments: number;
  onOpen: () => void;
}) {
  if (!photo.url) return null;
  return (
    <button type="button" onClick={onOpen} aria-label={strings.photos.open} className="relative block w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
      <img src={photo.url} alt={photo.caption ?? ""} className="aspect-square w-full object-cover" />
      {comments > 0 && (
        <span className="absolute bottom-1.5 start-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
          <MessagesIcon className="h-3.5 w-3.5" />
          {comments}
        </span>
      )}
    </button>
  );
}
