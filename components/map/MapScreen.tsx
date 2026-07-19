"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import { listDays, listItems } from "@/lib/data/itinerary";
import {
  DAY_COLORS,
  createPin,
  createRoute,
  deletePin,
  deleteRoute,
  listPins,
  listRoutes,
  navigationUrl,
  routePath,
} from "@/lib/data/map";
import {
  listGooglePhotos,
  type GooglePhotoWithUrl,
} from "@/lib/data/googlePhotos";
import { loadGoogleMaps } from "@/lib/places";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type {
  ItineraryDay,
  ItineraryItem,
  MapPin,
  SavedRoute,
  Trip,
} from "@/lib/types";
import { CarCard } from "./CarCard";
import { ImportRouteSheet } from "./ImportRouteSheet";

type Mode = "view" | "addPin" | "draw";

export function MapScreen() {
  const { member } = useMember();
  const isGuest = member?.role === "guest";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const drawLineRef = useRef<google.maps.Polyline | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const modeRef = useRef<Mode>("view");
  const drawPointsRef = useRef<[number, number][]>([]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [pinPhotos, setPinPhotos] = useState<Map<string, GooglePhotoWithUrl[]>>(
    new Map()
  );
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [drawCount, setDrawCount] = useState(0);
  const [pinAt, setPinAt] = useState<{ lat: number; lng: number } | null>(null);
  const [routeNameOpen, setRouteNameOpen] = useState(false);
  const [importingRoute, setImportingRoute] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDays, nextPins, nextRoutes] = await Promise.all([
      listDays(tripId),
      listPins(tripId),
      listRoutes(tripId),
    ]);
    setDays(nextDays);
    setPins(nextPins);
    setRoutes(nextRoutes);
    setItems(await listItems(nextDays.map((d) => d.id)));
  }, []);

  // init: data + map
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) return;
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
      } catch {
        showToast(strings.common.error);
      }

      const g = await loadGoogleMaps();
      if (cancelled) return;
      if (!g || !containerRef.current) {
        setNoKey(true);
        return;
      }
      const map = new g.maps.Map(containerRef.current, {
        center: { lat: 31.771, lng: 35.217 },
        zoom: 3,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        clickableIcons: false,
      });
      infoRef.current = new g.maps.InfoWindow();

      // addPin / draw modes consume map clicks
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const latLng = e.latLng;
        if (!latLng) return;
        if (modeRef.current === "addPin") {
          setPinAt({ lat: latLng.lat(), lng: latLng.lng() });
        } else if (modeRef.current === "draw") {
          drawPointsRef.current = [
            ...drawPointsRef.current,
            [latLng.lat(), latLng.lng()],
          ];
          setDrawCount(drawPointsRef.current.length);
          drawLineRef.current?.setPath(
            drawPointsRef.current.map(([lat, lng]) => ({ lat, lng }))
          );
        }
      });

      mapRef.current = map;
      setMapReady(true);

      // center on the user's current location (and mark it) — falls back to the
      // trip's fitBounds framing below when there's itinerary/pin data to show.
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) {
              setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000 }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  // Google photos attached to pins (family view only — guests read the map
  // read-only; shared Google photos appear in their Photos gallery instead).
  useEffect(() => {
    if (!trip || isGuest) return;
    let cancelled = false;
    void listGooglePhotos(trip.id)
      .then((all) => {
        if (cancelled) return;
        const byPin = new Map<string, GooglePhotoWithUrl[]>();
        for (const p of all) {
          if (!p.map_pin_id) continue;
          const list = byPin.get(p.map_pin_id) ?? [];
          list.push(p);
          byPin.set(p.map_pin_id, list);
        }
        setPinPhotos(byPin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip, isGuest]);

  // render markers + saved routes whenever data/filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || typeof google === "undefined") return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    const dayIndex = new Map(days.map((d, i) => [d.id, i]));
    const dayById = new Map(days.map((d) => [d.id, d]));

    const openInfo = (marker: google.maps.Marker, title: string, lat: number, lng: number, extra = "") => {
      const html =
        `<div dir="rtl" style="font-family:inherit;min-width:120px">` +
        `<strong>${title}</strong>${extra}` +
        `<div style="margin-top:6px"><a href="${navigationUrl(lat, lng)}" target="_blank" rel="noopener" ` +
        `style="color:#0d9488;font-weight:600">${strings.map.navigate} ↗</a></div></div>`;
      infoRef.current?.setContent(html);
      infoRef.current?.open({ map, anchor: marker });
    };

    // itinerary items, colored per day
    for (const item of items) {
      if (item.lat == null || item.lng == null) continue;
      if (dayFilter && item.day_id !== dayFilter) continue;
      const color = DAY_COLORS[(dayIndex.get(item.day_id) ?? 0) % DAY_COLORS.length];
      const marker = new google.maps.Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        title: item.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      const day = dayById.get(item.day_id);
      marker.addListener("click", () =>
        openInfo(
          marker,
          item.title,
          item.lat!,
          item.lng!,
          day ? `<div style="color:#64748b;font-size:12px">${formatShortDate(day.date)}${day.location_name ? ` · ${day.location_name}` : ""}</div>` : ""
        )
      );
      bounds.extend(marker.getPosition()!);
      markersRef.current.push(marker);
    }

    // custom + car pins
    for (const pin of pins) {
      const attached = pinPhotos.get(pin.id) ?? [];
      const hasPhotos = attached.length > 0;
      const marker = new google.maps.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.label,
        label: pin.kind === "car" ? "🚗" : hasPhotos ? "📷" : "📍",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 0, // emoji label only
        },
      });
      marker.addListener("click", () => {
        const first = attached.find((p) => p.url);
        const extra = first?.url
          ? `<img src="${first.url}" alt="" style="width:100%;border-radius:8px;margin-top:6px" />` +
            (attached.length > 1
              ? `<div style="color:#64748b;font-size:12px;margin-top:2px">+${attached.length - 1}</div>`
              : "")
          : "";
        openInfo(marker, pin.label, pin.lat, pin.lng, extra);
      });
      bounds.extend(marker.getPosition()!);
      markersRef.current.push(marker);
    }

    // saved routes
    for (const route of routes) {
      const path = routePath(route).map(([lat, lng]) => ({ lat, lng }));
      if (path.length < 2) continue;
      const line = new google.maps.Polyline({
        map,
        path,
        strokeColor: route.color ?? "#0d9488",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      });
      path.forEach((p) => bounds.extend(p));
      polylinesRef.current.push(line);
    }

    // "you are here" blue dot — not added to bounds, so a trip on the other
    // side of the world still frames the trip rather than zooming out to fit us
    if (myLoc) {
      const dot = new google.maps.Marker({
        map,
        position: myLoc,
        title: strings.map.youAreHere,
        zIndex: 9999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      markersRef.current.push(dot);
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    } else if (myLoc) {
      map.setCenter(myLoc);
      map.setZoom(12);
    }
  }, [mapReady, items, pins, routes, days, dayFilter, pinPhotos, myLoc]);

  function startDraw() {
    if (!mapRef.current || typeof google === "undefined") return;
    drawPointsRef.current = [];
    setDrawCount(0);
    drawLineRef.current = new google.maps.Polyline({
      map: mapRef.current,
      path: [],
      strokeColor: "#dc2626",
      strokeWeight: 4,
    });
    setMode("draw");
  }

  function clearDraw() {
    drawLineRef.current?.setMap(null);
    drawLineRef.current = null;
    drawPointsRef.current = [];
    setDrawCount(0);
    setMode("view");
  }

  const run = useCallback(
    async (action: () => Promise<void>, successMessage?: string) => {
      if (!trip) return;
      try {
        await action();
        await refresh(trip.id);
        if (successMessage) showToast(successMessage);
      } catch {
        showToast(strings.common.error);
      }
    },
    [trip, refresh, showToast]
  );

  const customPins = pins.filter((p) => p.kind !== "car");

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.map.title}</h1>

      {/* day filter */}
      {days.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setDayFilter(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
              dayFilter === null ? "bg-teal-600 text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {strings.map.dayFilterAll}
          </button>
          {days.map((day, i) => (
            <button
              key={day.id}
              type="button"
              onClick={() => setDayFilter(dayFilter === day.id ? null : day.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                dayFilter === day.id ? "bg-teal-600 text-white" : "bg-white text-slate-600 shadow-sm"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: DAY_COLORS[i % DAY_COLORS.length] }}
                aria-hidden="true"
              />
              {formatShortDate(day.date)}
            </button>
          ))}
        </div>
      )}

      {noKey ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {strings.map.noKey}
        </p>
      ) : (
        <div
          ref={containerRef}
          className="h-[45dvh] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
        />
      )}

      {/* mode controls (family only — guests get a read-only map) */}
      {mapReady && !isGuest && (
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          {mode === "view" && (
            <>
              <button
                type="button"
                onClick={() => setMode("addPin")}
                className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
              >
                📍 {strings.map.addPin}
              </button>
              <button
                type="button"
                onClick={startDraw}
                className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
              >
                ✏️ {strings.map.drawRoute}
              </button>
              <button
                type="button"
                onClick={() => setImportingRoute(true)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
              >
                ⤓ {strings.map.importRoute}
              </button>
            </>
          )}
          {mode === "addPin" && (
            <span className="flex items-center gap-2">
              <span className="text-slate-500">{strings.map.pinHint}</span>
              <button
                type="button"
                onClick={() => setMode("view")}
                className="rounded-xl border border-slate-300 px-3 py-2 text-slate-600"
              >
                {strings.common.cancel}
              </button>
            </span>
          )}
          {mode === "draw" && (
            <span className="flex items-center gap-2">
              <span className="text-slate-500">
                {strings.map.drawingHint} ({drawCount})
              </span>
              <button
                type="button"
                disabled={drawCount < 2}
                onClick={() => setRouteNameOpen(true)}
                className="rounded-xl bg-teal-600 px-3 py-2 text-white disabled:opacity-50"
              >
                {strings.map.finishRoute}
              </button>
              <button
                type="button"
                onClick={clearDraw}
                className="rounded-xl border border-slate-300 px-3 py-2 text-slate-600"
              >
                {strings.map.cancelDraw}
              </button>
            </span>
          )}
        </div>
      )}

      {/* where's the car */}
      {trip && !isGuest && <CarCard trip={trip} onToast={showToast} />}

      {/* custom pins list */}
      {customPins.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-1 px-1 text-sm font-semibold text-slate-500">
            {strings.map.addPin}
          </h2>
          <ul className="divide-y divide-slate-100">
            {customPins.map((pin) => (
              <li key={pin.id} className="flex items-center justify-between gap-2 px-1 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  📍 {pin.label}
                </span>
                <span className="flex shrink-0 gap-2 text-xs font-semibold">
                  <a
                    href={navigationUrl(pin.lat, pin.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-teal-50 px-2 py-1.5 text-teal-700"
                  >
                    {strings.map.navigate}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(strings.map.deletePinConfirm)) return;
                      void run(() => deletePin(pin));
                    }}
                    className="rounded-lg bg-rose-50 px-2 py-1.5 text-rose-600"
                  >
                    {strings.common.delete}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* saved routes list */}
      {routes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-1 px-1 text-sm font-semibold text-slate-500">
            {strings.map.routes}
          </h2>
          <ul className="divide-y divide-slate-100">
            {routes.map((route) => (
              <li key={route.id} className="flex items-center justify-between gap-2 px-1 py-2">
                <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium text-slate-800">
                  <span
                    className="inline-block h-2.5 w-6 rounded-full"
                    style={{ backgroundColor: route.color ?? "#0d9488" }}
                    aria-hidden="true"
                  />
                  {route.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(strings.map.deleteRouteConfirm)) return;
                    void run(() => deleteRoute(route.id));
                  }}
                  className="shrink-0 rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-600"
                >
                  {strings.common.delete}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* new pin label sheet */}
      {pinAt && trip && (
        <PinLabelSheet
          onClose={() => {
            setPinAt(null);
            setMode("view");
          }}
          onSave={(label) => {
            const at = pinAt;
            setPinAt(null);
            setMode("view");
            void run(() =>
              createPin({ tripId: trip.id, label, lat: at.lat, lng: at.lng })
            );
          }}
        />
      )}

      {/* route name sheet */}
      {routeNameOpen && trip && (
        <RouteNameSheet
          onClose={() => setRouteNameOpen(false)}
          onSave={(name) => {
            setRouteNameOpen(false);
            const points = drawPointsRef.current;
            const color = DAY_COLORS[routes.length % DAY_COLORS.length];
            clearDraw();
            void run(
              () => createRoute({ tripId: trip.id, name, path: points, color }),
              strings.map.routeSaved
            );
          }}
        />
      )}

      {/* import route from a spreadsheet */}
      {importingRoute && trip && (
        <ImportRouteSheet
          tripId={trip.id}
          onClose={() => setImportingRoute(false)}
          onDone={(message) => {
            setImportingRoute(false);
            void refresh(trip.id).then(() => showToast(message));
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function PinLabelSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState("");
  return (
    <Sheet open onClose={onClose} title={strings.map.addPin}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) onSave(label.trim());
        }}
      >
        <div>
          <label htmlFor="pin-label" className="mb-1 block text-sm font-medium text-slate-600">
            {strings.map.pinLabel}
          </label>
          <input
            id="pin-label"
            type="text"
            required
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}

function RouteNameSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Sheet open onClose={onClose} title={strings.map.finishRoute}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <div>
          <label htmlFor="route-name" className="mb-1 block text-sm font-medium text-slate-600">
            {strings.map.routeName}
          </label>
          <input
            id="route-name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}
