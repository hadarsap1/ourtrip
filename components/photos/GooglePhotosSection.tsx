"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import {
  deleteGooglePhoto,
  groupGooglePhotos,
  listGooglePhotos,
  type GooglePhotoWithUrl,
} from "@/lib/data/googlePhotos";
import {
  beginPickerSession,
  finishPickerImport,
  isGooglePhotosConfigured,
  preloadGis,
} from "@/lib/gphotos/picker";
import { strings } from "@/lib/strings";

type Phase = "idle" | "connecting" | "picking" | "importing";

export function GooglePhotosSection({
  tripId,
  isOwner,
}: {
  tripId: string;
  isOwner: boolean;
}) {
  const [photos, setPhotos] = useState<GooglePhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pickerUri, setPickerUri] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GooglePhotoWithUrl | null>(null);
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
    void listGooglePhotos(tripId)
      .then((p) => {
        if (!cancelled) setPhotos(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
      // open Google's picker (may be blocked — we keep the URI as a fallback)
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

  async function handleDelete(photo: GooglePhotoWithUrl) {
    if (!confirm(strings.googlePhotos.deleteConfirm)) return;
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
          <h2 className="text-lg font-bold text-slate-800">
            {strings.googlePhotos.title}
          </h2>
          <p className="text-xs text-slate-500">{strings.googlePhotos.subtitle}</p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white shadow-sm"
          >
            ➕ {strings.googlePhotos.import}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400">{strings.common.loading}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {strings.googlePhotos.empty}
        </p>
      ) : (
        groups.map((group, i) => (
          <div key={`${group.country ?? ""}-${group.area ?? ""}-${i}`}>
            <h3 className="mb-1.5 px-1 text-sm font-semibold text-slate-500">
              {group.country || strings.googlePhotos.noGroup}
              {group.area ? ` · ${group.area}` : ""}
            </h3>
            <ul className="grid grid-cols-3 gap-1.5">
              {group.photos.map((photo) => (
                <li key={photo.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setLightbox(photo)}
                    className="block aspect-square w-full overflow-hidden rounded-xl bg-slate-100 shadow-sm"
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
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(photo)}
                      aria-label={strings.common.delete}
                      className="absolute end-1 top-1 rounded-full bg-black/50 px-1.5 py-0.5 text-xs text-white"
                    >
                      ✕
                    </button>
                  )}
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
              <h3 className="text-base font-bold text-slate-800">
                {strings.googlePhotos.import}
              </h3>
              <button
                type="button"
                onClick={() => !busy && setSheetOpen(false)}
                className="text-sm font-semibold text-slate-400"
              >
                {strings.googlePhotos.cancel}
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-600">
              {strings.googlePhotos.countryLabel}
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={strings.googlePhotos.countryPlaceholder}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-600">
              {strings.googlePhotos.areaLabel}
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={strings.googlePhotos.areaPlaceholder}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={() => void runImport()}
              disabled={busy}
              className="w-full rounded-2xl bg-slate-800 py-3 font-bold text-white shadow disabled:opacity-60"
            >
              {phase === "connecting"
                ? strings.googlePhotos.connecting
                : phase === "picking"
                  ? strings.googlePhotos.picking
                  : phase === "importing"
                    ? strings.googlePhotos.importing
                    : `📷 ${strings.googlePhotos.start}`}
            </button>

            {phase === "picking" && pickerUri && (
              <a
                href={pickerUri}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs font-semibold text-teal-600 underline"
              >
                {strings.googlePhotos.pickingHint}
              </a>
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
