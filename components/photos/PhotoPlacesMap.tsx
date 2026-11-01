"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/places";
import { strings } from "@/lib/strings";
import type { PlaceGroup } from "@/lib/photoPlaces";

/**
 * Where the photos were taken, on a small map above the sections (Hadar
 * 01/11/2026). One pin per place with how many photos it has; tapping a pin
 * jumps to that place's newest section. No Maps key, offline, or no place
 * with a point: the map is simply not there and the list stands on its own.
 */
export function PhotoPlacesMap<P>({
  groups,
  onPick,
}: {
  groups: PlaceGroup<P>[];
  onPick: (key: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  // one pin per place; groups come newest first, so the first seen is the newest
  const pins = useMemo(() => {
    const byPlace = new Map<string, { key: string; place: string; lat: number; lng: number; n: number }>();
    for (const g of groups) {
      if (g.lat === null || g.lng === null || !g.place) continue;
      const pin = byPlace.get(g.place);
      if (pin) pin.n += g.photos.length;
      else byPlace.set(g.place, { key: g.key, place: g.place, lat: g.lat, lng: g.lng, n: g.photos.length });
    }
    return [...byPlace.values()];
  }, [groups]);

  useEffect(() => {
    if (pins.length === 0) return;
    let cancelled = false;
    const markers: google.maps.Marker[] = [];
    void (async () => {
      const google = await loadGoogleMaps();
      if (cancelled) return;
      if (!google || !containerRef.current) {
        setFailed(true);
        return;
      }
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: pins[0].lat, lng: pins[0].lng },
        zoom: 9,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const bounds = new google.maps.LatLngBounds();
      for (const pin of pins) {
        const marker = new google.maps.Marker({
          map,
          position: { lat: pin.lat, lng: pin.lng },
          title: strings.photos.mapPin.replace("{place}", pin.place).replace("{n}", String(pin.n)),
          label: { text: String(pin.n), color: "#ffffff", fontSize: "12px", fontWeight: "700" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#c2410c",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => onPick(pin.key));
        markers.push(marker);
        bounds.extend(marker.getPosition()!);
      }
      if (pins.length > 1) map.fitBounds(bounds, 32);
    })();
    return () => {
      cancelled = true;
      markers.forEach((m) => m.setMap(null));
    };
  }, [pins, onPick]);

  if (pins.length === 0 || failed) return null;
  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={strings.photos.mapLabel}
      className="h-48 w-full overflow-hidden rounded-2xl border border-line bg-paper-deep"
    />
  );
}
