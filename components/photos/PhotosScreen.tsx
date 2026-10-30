"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  uploadPhoto,
  type PhotoWithUrl,
} from "@/lib/data/photos";
import { formatDate } from "@/lib/format";
import { CameraIcon, CheckIcon, CloseIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Trip } from "@/lib/types";
import { GooglePhotosSection } from "./GooglePhotosSection";
import { AudienceRow, AudienceSheet } from "@/components/AudienceSheet";
import { listMyGroups } from "@/lib/data/groups";
import { CaptionSheet, PhotoCaption } from "./PhotoCaption";

export function PhotosScreen() {
  const { member } = useMember();
  if (member?.role === "guest") return <GuestPhotosView />;
  return <FamilyPhotosView />;
}

// Guest portal: approved+shared photos only, grouped by day (Sprint 7).
// Rows and URLs both come from the guest-photos Edge Function.
function GuestPhotosView() {
  const [photos, setPhotos] = useState<GuestPhoto[]>([]);
  const [googlePhotos, setGooglePhotos] = useState<GuestGooglePhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listGuestPhotos().catch(() => [] as GuestPhoto[]),
      listGuestGooglePhotos().catch(() => [] as GuestGooglePhoto[]),
    ])
      .then(([p, g]) => {
        if (!cancelled) {
          setPhotos(p);
          setGooglePhotos(g);
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
      <h1 className="text-2xl font-bold">{strings.photos.title}</h1>
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
                {photo.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img
                    src={photo.url}
                    alt={photo.caption ?? ""}
                    className="aspect-square w-full object-cover"
                  />
                )}
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
    </div>
  );
}

function FamilyPhotosView() {
  const { member } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // guest groups (00063): a parent can limit a shared photo to some of them
  const [groups, setGroups] = useState<string[]>([]);
  const [audienceFor, setAudienceFor] = useState<PhotoWithUrl | null>(null);
  // who the next upload is for - everyone by default (00064)
  const [uploadAudience, setUploadAudience] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // the composer on the screen (no sheet after the picker: on an iPhone
  // nothing opened after picking - 30/10): the text, and the picked photo
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [captionFor, setCaptionFor] = useState<PhotoWithUrl | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setPhotos(await listPhotos(tripId));
  }, []);

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

  function pickFile(file: File | null) {
    if (!file) return;
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft({ file, url: URL.createObjectURL(file) });
  }

  function closeDraft() {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
    // cleared only now, so picking the same photo again still fires onChange
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleUpload() {
    if (!draft || !trip || !member || uploading) return;
    setUploading(true);
    try {
      await uploadPhoto({
        tripId: trip.id,
        memberId: member.id,
        isOwner: member.role === "owner",
        file: draft.file,
        caption: draftText,
        audience: uploadAudience,
      });
      closeDraft();
      setDraftText("");
      await refresh(trip.id);
      showToast(
        member.role === "owner"
          ? strings.photos.uploadedOwner
          : strings.photos.uploaded
      );
    } catch {
      showToast(strings.common.error);
    } finally {
      setUploading(false);
    }
  }

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
      <h1 className="text-2xl font-bold">{strings.photos.title}</h1>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder={strings.photos.captionPlaceholder}
          aria-label={strings.photos.textTitle}
          dir="auto"
          rows={3}
          className="block w-full resize-y rounded-xl border border-line bg-paper p-3 text-[16px] leading-[1.6] text-ink focus:border-sea focus:outline-none"
        />
        {draft && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={draft.url} alt="" className="max-h-64 w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={closeDraft}
              disabled={uploading}
              aria-label={strings.photos.removePicked}
              className="absolute end-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* A real tap on a label opens the picker - more reliable on an iPhone
            than a script clicking a hidden input. No `capture`: it makes phones
            open the camera only; without it they offer the gallery too. */}
        <label
          className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl font-bold ${
            draft ? "border border-line text-ink-soft" : "bg-sea text-on-sea shadow hover:bg-sea-deep"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <CameraIcon className="h-4 w-4" />
          {draft ? strings.photos.changePhoto : strings.photos.pickPhoto}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <AudienceRow label={strings.audience.who} value={uploadAudience} onChange={setUploadAudience} />
        {draft && (
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading}
            className="w-full rounded-xl bg-sea py-3 font-bold text-on-sea shadow hover:bg-sea-deep disabled:opacity-60"
          >
            {uploading ? strings.photos.uploading : strings.photos.send}
          </button>
        )}
      </section>

      {/* Google Photos: owner imports, family (owner + kids) views */}
      {trip && (
        <div className="border-t border-line pt-4">
          <GooglePhotosSection tripId={trip.id} isOwner={isOwner} />
        </div>
      )}

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
              {photo.url && (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                <img
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  className="aspect-square w-full object-cover"
                />
              )}
              <div className="space-y-1 p-2 text-xs">
                {photo.caption && <PhotoCaption text={photo.caption} />}
                {/* a kid edits their own text only before approval until 00076 is
                    live in the database - it sends an approved photo whose text
                    changed back to a parent. Lift `status !== "approved"` then. */}
                {(isOwner || (photo.uploaded_by === member?.id && photo.status !== "approved")) && (
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
          setCaptionFor(null);
          try {
            await updatePhotoCaption(id, text);
            const caption = text.trim() || null;
            setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, caption } : x)));
            showToast(strings.photos.textSaved);
          } catch {
            showToast(strings.common.error);
          }
        }}
      />
      <Toast message={toast} />
    </div>
  );
}
