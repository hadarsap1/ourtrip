"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  approvePhoto,
  deletePhoto,
  listPhotos,
  rejectPhoto,
  setPhotoShared,
  uploadPhoto,
  type PhotoWithUrl,
} from "@/lib/data/photos";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Trip } from "@/lib/types";

export function PhotosScreen() {
  const { member } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  async function handleUpload(file: File | null) {
    if (!file || !trip || !member || uploading) return;
    setUploading(true);
    try {
      await uploadPhoto({
        tripId: trip.id,
        memberId: member.id,
        isOwner: member.role === "owner",
        file,
      });
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
      if (fileRef.current) fileRef.current.value = "";
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
        <p className="text-center text-slate-500">{strings.common.loading}</p>
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

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full rounded-2xl bg-teal-600 py-3 font-bold text-white shadow hover:bg-teal-700 disabled:opacity-60"
      >
        📷 {uploading ? strings.photos.uploading : strings.photos.upload}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
      />

      {/* owner approval queue (kid uploads land here — DECISIONS #4) */}
      {isOwner && pending.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
          <h2 className="mb-2 px-1 text-sm font-bold text-amber-800">
            {strings.photos.approvalQueue} ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                {photo.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img src={photo.url} alt={photo.caption ?? ""} className="max-h-72 w-full object-cover" />
                )}
                <div className="flex gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => member && void run(() => approvePhoto(photo.id, member.id))}
                    className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white"
                  >
                    ✓ {strings.photos.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => member && void run(() => rejectPhoto(photo.id, member.id))}
                    className="flex-1 rounded-lg bg-rose-100 py-2 text-sm font-bold text-rose-600"
                  >
                    ✕ {strings.photos.reject}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length === 0 && pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {strings.photos.empty}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {visible.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
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
                  <label className="flex items-center gap-1.5 font-semibold text-slate-500">
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
                      className="h-3.5 w-3.5 accent-teal-600"
                    />
                    {strings.photos.shareToggle}
                  </label>
                )}
                {!isOwner && photo.shared_with_guests && (
                  <span className="font-semibold text-teal-600">
                    {strings.photos.shared}
                  </span>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(strings.photos.deleteConfirm)) return;
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

      <Toast message={toast} />
    </div>
  );
}
