"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import { listDays } from "@/lib/data/itinerary";
import { groupByPlace, placeByDate, type PlaceGroup } from "@/lib/photoPlaces";
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
  uploadPhoto,
  setPhotoDate,
  type PhotoWithUrl,
} from "@/lib/data/photos";
import Link from "next/link";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { FeedbackCount } from "@/components/feedback/FeedbackCount";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import { failureText } from "@/lib/failureText";
import { LoadFailed } from "@/components/LoadFailed";
import { useMember } from "@/lib/useMember";
import type { ItineraryDay, Trip } from "@/lib/types";
import { GooglePhotosSection } from "./GooglePhotosSection";
import { AudienceSheet } from "@/components/AudienceSheet";
import { listMyGroups } from "@/lib/data/groups";
import { CaptionSheet, PhotoCaption } from "./PhotoCaption";
import { PhotoView, type ViewedPhoto } from "./PhotoView";
import { usePhotoFeedback, type FeedbackBadge } from "./usePhotoFeedback";
import { PhotoPlacesMap } from "./PhotoPlacesMap";
import { PlaceHeader } from "./PlaceHeader";
import { FabPicker } from "@/components/ui/Fab";

// Photos are a place of their own again, by place (Hadar 01/11/2026): a small
// map of where they were taken, then one section per stretch of the trip,
// newest first, photos in the order they were taken.

const sectionId = (key: string) => `place-${encodeURIComponent(key)}`;

function scrollToPlace(key: string) {
  document.getElementById(sectionId(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** The map, then a section per place; `tile` draws one photo. */
function PlaceSections<P extends { id: string }>({
  groups,
  tile,
}: {
  groups: PlaceGroup<P>[];
  tile: (photo: P) => React.ReactNode;
}) {
  return (
    <>
      <PhotoPlacesMap groups={groups} onPick={scrollToPlace} />
      {groups.map((group) => (
        <section key={group.key} id={sectionId(group.key)} className="scroll-mt-4">
          <PlaceHeader group={group} />
          <ul className="grid grid-cols-2 gap-2">{group.photos.map(tile)}</ul>
        </section>
      ))}
    </>
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

  // the place comes with each photo from guest-photos (guests cannot read
  // the itinerary days themselves, 00009)
  const groups = groupByPlace(photos, (p) => ({
    place: p.place ?? null,
    country_code: p.country_code ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  }));

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
      </header>
      {isEmpty && (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
          {strings.photos.empty}
        </p>
      )}

      <PlaceSections
        groups={groups}
        tile={(photo) => (
          <li key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <PhotoTile photo={photo} badge={feedback.photoBadge(photo.id)} onOpen={() => setViewing(photo)} />
            {photo.caption && (
              <div className="p-2">
                <PhotoCaption text={photo.caption} />
              </div>
            )}
          </li>
        )}
      />

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
  // the itinerary days: a photo's place is the day it was taken on
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [loading, setLoading] = useState(true);
  // the list did not load: say so, never "no photos yet"
  const [loadFailed, setLoadFailed] = useState(false);
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
  const feedback = usePhotoFeedback(trip?.id ?? null, true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      // the places are a nicety: without them the photos still show, by day
      void listDays(activeTrip.id)
        .then((d) => !cancelled && setDays(d))
        .catch(() => {});
      try {
        await refresh(activeTrip.id);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const retryLoad = useCallback(async () => {
    if (!trip) return;
    try {
      await refresh(trip.id);
      setLoadFailed(false);
      void listDays(trip.id)
        .then(setDays)
        .catch(() => {});
    } catch {
      // still failing: the card stays, and retries again when the line is back
    }
  }, [trip, refresh]);

  // the + opens the picker straight away; photos go to the grid, in no update
  // (Hadar 04/11/2026, amends #46). A parent's photo is approved but not
  // shared - sharing stays its own step (rule 3, DECISIONS #5).
  const [uploading, setUploading] = useState(false);
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!trip || !member || uploading) return;
      setUploading(true);
      try {
        for (const file of files) {
          await uploadPhoto({ tripId: trip.id, memberId: member.id, isOwner: member.role === "owner", file });
        }
        showToast(strings.photos.uploadedOwner);
      } catch {
        showToast(failureText());
      } finally {
        setUploading(false);
        await refresh(trip.id).catch(() => {});
      }
    },
    [trip, member, uploading, refresh, showToast]
  );

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
        showToast(failureText());
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
      {/* Photos are added here with the + (straight to the picker) or with an
          update; here they are approved, shared and browsed by place. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{strings.photos.title}</h1>
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

      {loadFailed ? (
        <LoadFailed onRetry={retryLoad} />
      ) : visible.length === 0 && pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">
          {strings.photos.empty}
        </p>
      ) : (
        <PlaceSections
          groups={groupByPlace(visible, placeByDate(days))}
          tile={(photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
            >
              <PhotoTile photo={photo} badge={feedback.photoBadge(photo.id)} onOpen={() => setViewing(photo)} />
              <div className="space-y-1 p-2 text-xs">
                <StoryFeedbackLink badge={feedback.storyBadge(photo.id)} />
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
          )}
        />
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
          storyFeedback={<StoryFeedbackLink badge={feedback.storyBadge(viewing.id)} inSheet />}
          onChangeDate={
            isOwner
              ? async (date) => {
                  const id = viewing.id;
                  try {
                    await setPhotoDate(id, date);
                    setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, taken_on: date } : x)));
                    setViewing((v) => (v && v.id === id ? { ...v, taken_on: date } : v));
                    showToast(strings.photos.dateSaved);
                  } catch {
                    showToast(strings.common.error);
                    throw new Error("photo date failed");
                  }
                }
              : undefined
          }
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
      {isOwnerRole && trip && (
        <FabPicker label={strings.photos.upload} accept="image/*" multiple busy={uploading} onFiles={(files) => void uploadFiles(files)} />
      )}
      <Toast message={toast} />
    </div>
  );
}

/** A photo in the grid: tap to open it with its likes and comments (00077),
 *  counted over the picture with "new" for what came since I last looked. */
function PhotoTile({
  photo,
  badge,
  onOpen,
}: {
  photo: { url: string | null; caption: string | null };
  badge: FeedbackBadge;
  onOpen: () => void;
}) {
  if (!photo.url) return null;
  return (
    <button type="button" onClick={onOpen} aria-label={strings.photos.open} className="relative block w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
      <img src={photo.url} alt={photo.caption ?? ""} className="aspect-square w-full object-cover" />
      <span className="absolute top-1.5 start-1.5">
        <FeedbackCount overlay comments={badge.comments} likes={badge.likes} isNew={badge.isNew} />
      </span>
    </button>
  );
}

/** The photo is in an update and people wrote there: how much, and a tap to
 *  read it on the update. */
function StoryFeedbackLink({
  badge,
  inSheet = false,
}: {
  badge: (FeedbackBadge & { postId: string }) | null;
  /** in the photo sheet: says where the tap goes */
  inSheet?: boolean;
}) {
  if (!badge) return null;
  return (
    <Link
      href={`/stories#feedback-${badge.postId}`}
      aria-label={strings.feedback.onStoryLabel}
      // flex, not block: a block around the inline-flex counts sat it on the
      // text baseline, off-centre in the pill
      className="flex w-fit items-center gap-1.5 rounded-full bg-sv-paper px-2.5 py-1 leading-none"
    >
      <FeedbackCount
        comments={badge.comments}
        likes={badge.likes}
        isNew={badge.isNew}
        suffix={strings.feedback.onStory}
      />
      {inSheet && <span className="text-xs font-bold text-sea">{strings.feedback.toStory}</span>}
    </Link>
  );
}
