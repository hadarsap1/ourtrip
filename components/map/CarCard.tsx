"use client";

import { useEffect, useRef, useState } from "react";
import {
  deletePin,
  getCarPin,
  getCurrentPosition,
  getPinPhotoUrl,
  navigationUrl,
  saveCarPin,
  updateCarPhoto,
} from "@/lib/data/map";
import { strings } from "@/lib/strings";
import type { MapPin, Trip } from "@/lib/types";

// Where's the car (SPEC 2.7): 1-tap save (geolocation), 1-tap navigate back,
// optional parking photo.
export function CarCard({
  trip,
  onToast,
}: {
  trip: Trip;
  onToast: (message: string) => void;
}) {
  const [carPin, setCarPin] = useState<MapPin | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCarPin(trip.id)
      .then(async (pin) => {
        if (cancelled) return;
        setCarPin(pin);
        if (pin?.photo_path) {
          const url = await getPinPhotoUrl(pin.photo_path).catch(() => null);
          if (!cancelled) setPhotoUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  async function refreshPin() {
    const pin = await getCarPin(trip.id);
    setCarPin(pin);
    setPhotoUrl(
      pin?.photo_path ? await getPinPhotoUrl(pin.photo_path).catch(() => null) : null
    );
  }

  // 1 tap: current position → replaces the previous car pin
  async function handleSave() {
    if (busy) return;
    setBusy(true);
    try {
      const position = await getCurrentPosition();
      await saveCarPin({
        tripId: trip.id,
        lat: position.lat,
        lng: position.lng,
        label: strings.map.car,
      });
      await refreshPin();
      onToast(strings.map.carSaved);
    } catch (e) {
      onToast(
        e instanceof Error && e.message !== "geolocation unavailable"
          ? strings.map.carLocationError
          : strings.common.error
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | null) {
    if (!file || !carPin || busy) return;
    setBusy(true);
    try {
      await updateCarPhoto(carPin, file);
      await refreshPin();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!carPin || busy) return;
    if (!confirm(strings.map.carDeleteConfirm)) return;
    setBusy(true);
    deletePin(carPin)
      .then(() => {
        setCarPin(null);
        setPhotoUrl(null);
      })
      .catch(() => onToast(strings.common.error))
      .finally(() => setBusy(false));
  }

  const savedAt = carPin
    ? new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(carPin.created_at))
    : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          🚗 {strings.map.car}
        </h2>
        {carPin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-xs font-semibold text-rose-500 disabled:opacity-50"
          >
            {strings.common.delete}
          </button>
        )}
      </div>

      {carPin ? (
        <div className="mt-2 flex items-center gap-3">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL
            <img
              src={photoUrl}
              alt={strings.map.carPhoto}
              className="h-16 w-16 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">
              {strings.map.carSavedAt} {savedAt}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2 text-sm font-semibold">
              <a
                href={navigationUrl(carPin.lat, carPin.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-teal-600 px-3 py-2 text-white hover:bg-teal-700"
              >
                {strings.map.carNavigate}
              </a>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                📷 {strings.map.carPhoto}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-400">{strings.map.carNone}</p>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="mt-3 w-full rounded-xl border border-teal-600 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
      >
        {strings.map.carSave}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)}
      />
    </section>
  );
}
