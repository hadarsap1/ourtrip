"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import {
  deleteGooglePhoto,
  groupGooglePhotos,
  listGooglePhotos,
  setGooglePhotoPin,
  setGooglePhotoShared,
  type GooglePhotoWithUrl,
} from "@/lib/data/googlePhotos";
import { listPins } from "@/lib/data/map";
import {
  beginPickerSession,
  finishPickerImport,
  isGooglePhotosConfigured,
  preloadGis,
} from "@/lib/gphotos/picker";
import { CameraIcon, PlusIcon, UsersIcon } from "@/components/icons";
import { CarIcon, CloseIcon, PinIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import type { MapPin } from "@/lib/types";

type Phase = "idle" | "connecting" | "picking" | "importing";

export function GooglePhotosSection({
  tripId,
  isOwner,
}: {
  tripId: string;
  isOwner: boolean;
}) {
  const [photos, setPhotos] = useState<GooglePhotoWithUrl[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pickerUri, setPickerUri] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GooglePhotoWithUrl | null>(null);
  const [actionPhoto, setActionPhoto] = useState<GooglePhotoWithUrl | null>(null);
  const [attaching, setAttaching] = useState<GooglePhotoWithUrl | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pickerWindow = useRef<Window | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    setPhotos(await listGooglePhotos(tripId));
  }, [tripId]);

  useEffect(() => {
    if (isOwner) void preloadGis().catch(() => {});
    let cancelled = false;
    void (async () => {
      try {
        const [ph, pn] = await Promise.all([
          listGooglePhotos(tripId),
          isOwner ? listPins(tripId) : Promise.resolve([] as MapPin[]),
        ]);
        if (!cancelled) {
          setPhotos(ph);
          setPins(pn);
        }
      } catch {
        /* offline / empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, isOwner]);

  const busy = phase !== "idle";

  async function runImport() {
    if (!isGooglePhotosConfigured()) {
      showToast(strings.googlePhotos.notConfigured);
      return;
    }
    if (busy) return;
    setPhase("connecting");
    try {
      const session = await beginPickerSession();
      pickerWindow.current = window.open(session.pickerUri, "gphotos-picker");
      setPickerUri(session.pickerUri);
      setPhase("picking");
      const result = await finishPickerImport({
        session,
        country: country.trim() || null,
        area: area.trim() || null,
      });
      pickerWindow.current?.close();
      pickerWindow.current = null;
      setPickerUri(null);
      showToast(
        result.imported > 0
          ? strings.googlePhotos.imported(result.imported)
          : strings.googlePhotos.importedNone
      );
      await refresh();
      setSheetOpen(false);
      setCountry("");
      setArea("");
    } catch {
      pickerWindow.current?.close();
      pickerWindow.current = null;
      setPickerUri(null);
      showToast(strings.common.error);
    } finally {
      setPhase("idle");
    }
  }

  /** Optimistic patch of one photo in local state. */
  const patchPhoto = useCallback(
    (id: string, patch: Partial<GooglePhotoWithUrl>) => {
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      setActionPhoto((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    },
    []
  );

  async function toggleShared(photo: GooglePhotoWithUrl, shared: boolean) {
    patchPhoto(photo.id, { shared_with_guests: shared });
    try {
      await setGooglePhotoShared(photo.id, shared);
    } catch {
      patchPhoto(photo.id, { shared_with_guests: !shared });
      showToast(strings.common.error);
    }
  }

  async function attachToPin(photo: GooglePhotoWithUrl, pinId: string | null) {
    patchPhoto(photo.id, { map_pin_id: pinId });
    setAttaching(null);
    setActionPhoto(null);
    try {
      await setGooglePhotoPin(photo.id, pinId);
    } catch {
      patchPhoto(photo.id, { map_pin_id: photo.map_pin_id });
      showToast(strings.common.error);
    }
  }

  async function handleDelete(photo: GooglePhotoWithUrl) {
    if (!confirm(strings.googlePhotos.deleteConfirm)) return;
    setActionPhoto(null);
    try {
      await deleteGooglePhoto(photo);
      await refresh();
    } catch {
      showToast(strings.common.error);
    }
  }

  const groups = groupGooglePhotos(photos);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">
            {strings.googlePhotos.title}
          </h2>
          <p className="text-xs text-ink-soft">{strings.googlePhotos.subtitle}</p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <PlusIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
            {strings.googlePhotos.import}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-ink-soft">{strings.common.loading}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          {strings.googlePhotos.empty}
        </p>
      ) : (
        groups.map((group, i) => (
          <div key={`${group.country ?? ""}-${group.area ?? ""}-${i}`}>
            <h3 className="mb-1.5 px-1 text-sm font-semibold text-ink-soft">
              {group.country || strings.googlePhotos.noGroup}
              {group.area ? ` · ${group.area}` : ""}
            </h3>
            <ul className="grid grid-cols-3 gap-1.5">
              {group.photos.map((photo) => (
                <li key={photo.id} className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      isOwner ? setActionPhoto(photo) : setLightbox(photo)
                    }
                    className="block aspect-square w-full overflow-hidden rounded-xl bg-paper-deep shadow-sm"
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
                  </button>
                  {/* status badges */}
                  <div className="pointer-events-none absolute bottom-1 start-1 flex gap-1 text-[10px]">
                    {photo.map_pin_id && (
                      <span className="rounded-full bg-black/55 p-1 text-white">
                        <CameraIcon className="h-3 w-3" />
                      </span>
                    )}
                    {photo.shared_with_guests && (
                      <span className="rounded-full bg-sea/85 p-1 text-white">
                        <UsersIcon className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {/* import sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-lg space-y-3 rounded-t-3xl bg-white p-4 pb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {strings.googlePhotos.import}
              </h3>
              <button
                type="button"
                onClick={() => !busy && setSheetOpen(false)}
                className="text-sm font-semibold text-ink-soft"
              >
                {strings.googlePhotos.cancel}
              </button>
            </div>

            <label className="block text-sm font-medium text-ink-soft">
              {strings.googlePhotos.countryLabel}
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={strings.googlePhotos.countryPlaceholder}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-ink-soft">
              {strings.googlePhotos.areaLabel}
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={strings.googlePhotos.areaPlaceholder}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={() => void runImport()}
              disabled={busy}
              className="w-full rounded-2xl bg-ink py-3 font-bold text-white shadow disabled:opacity-60"
            >
              {phase === "connecting"
                ? strings.googlePhotos.connecting
                : phase === "picking"
                  ? strings.googlePhotos.picking
                  : phase === "importing"
                    ? strings.googlePhotos.importing
                    : (
                        <>
                          <CameraIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
                          {strings.googlePhotos.start}
                        </>
                      )}
            </button>

            {phase === "picking" && pickerUri && (
              <a
                href={pickerUri}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs font-semibold text-sea underline"
              >
                {strings.googlePhotos.pickingHint}
              </a>
            )}
          </div>
        </div>
      )}

      {/* owner per-photo actions */}
      {actionPhoto && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
          onClick={() => setActionPhoto(null)}
        >
          <div
            className="w-full max-w-lg space-y-3 rounded-t-3xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                const p = actionPhoto;
                setActionPhoto(null);
                setLightbox(p);
              }}
              className="block w-full overflow-hidden rounded-2xl bg-paper-deep"
            >
              {actionPhoto.url && (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                <img
                  src={actionPhoto.url}
                  alt={actionPhoto.filename ?? ""}
                  className="max-h-56 w-full object-cover"
                />
              )}
            </button>

            <label className="flex items-center justify-between rounded-xl bg-paper-deep px-3 py-2.5 text-sm font-medium text-ink">
              <UsersIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
              {strings.googlePhotos.shareToggle}
              <input
                type="checkbox"
                checked={actionPhoto.shared_with_guests}
                onChange={(e) => void toggleShared(actionPhoto, e.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
            </label>

            <button
              type="button"
              onClick={() => setAttaching(actionPhoto)}
              className="flex w-full items-center justify-between rounded-xl bg-paper-deep px-3 py-2.5 text-sm font-medium text-ink"
            >
              <CameraIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
              {strings.googlePhotos.attachToPin}
              <span className="text-xs text-ink-soft">
                {actionPhoto.map_pin_id
                  ? (pins.find((p) => p.id === actionPhoto.map_pin_id)?.label ??
                    strings.googlePhotos.attached)
                  : "›"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleDelete(actionPhoto)}
              className="w-full rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-600"
            >
              {strings.common.delete}
            </button>
          </div>
        </div>
      )}

      {/* attach-to-pin picker */}
      {attaching && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setAttaching(null)}
        >
          <div
            className="max-h-[70vh] w-full max-w-lg space-y-2 overflow-y-auto rounded-t-3xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-ink">
              {strings.googlePhotos.attachTitle}
            </h3>
            {attaching.map_pin_id && (
              <button
                type="button"
                onClick={() => void attachToPin(attaching, null)}
                className="w-full rounded-xl bg-rose-50 px-3 py-2.5 text-start text-sm font-semibold text-rose-600"
              >
                <CloseIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                  {strings.googlePhotos.detach}
              </button>
            )}
            {pins.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft">
                {strings.googlePhotos.attachNone}
              </p>
            ) : (
              pins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => void attachToPin(attaching, pin.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-start text-sm font-medium ${
                    attaching.map_pin_id === pin.id
                      ? "bg-sea text-white"
                      : "bg-paper-deep text-ink"
                  }`}
                >
                  {pin.kind === "car" ? (
                    <CarIcon className="inline-block h-4 w-4 align-text-bottom" />
                  ) : (
                    <PinIcon className="inline-block h-4 w-4 align-text-bottom" />
                  )}{" "}
                  {pin.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* lightbox */}
      {lightbox?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
          <img
            src={lightbox.url}
            alt={lightbox.filename ?? ""}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}

      <Toast message={toast} />
    </section>
  );
}
