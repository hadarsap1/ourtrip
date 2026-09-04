"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { boundsOf } from "@/lib/data/placeOptions";
import { loadGoogleMaps } from "@/lib/places";
import { strings } from "@/lib/strings";
import type { PlaceOption } from "@/lib/types";

// Pin colour per category, so a glance at the map separates "where we'd sleep"
// from "where we'd eat" without opening anything.
const CATEGORY_COLOR: Record<string, string> = {
  hotel: "#7c3aed",
  restaurant: "#ea580c",
  attraction: "#0e7c6b",
  activity: "#0284c7",
  city: "#475569",
  nature: "#16a34a",
  transport: "#a16207",
  shop: "#db2777",
  other: "#64748b",
};

/** Renders the currently-filtered options as pins.
 *
 *  It deliberately takes the ALREADY-FILTERED list: the parent owns the cuts,
 *  so the map and the list can never disagree about what is showing. Whenever
 *  that list changes the view refits to it, which is what "focus on an area"
 *  actually means here — narrow the cut, the map follows. */
export function OptionsMap({
  options,
  unlocatedCount,
  gaveUpCount,
  onLocate,
  locating,
}: {
  options: PlaceOption[];
  unlocatedCount: number;
  /** Of those, how many the geocoder has already tried and refused. */
  gaveUpCount: number;
  onLocate: () => void;
  locating: string | null;
}) {
  const s = strings.options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  const located = useMemo(
    () => options.filter((o) => o.lat != null && o.lng != null),
    [options]
  );

  // Boot the map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const google = await loadGoogleMaps();
      if (cancelled) return;
      if (!google || !containerRef.current) {
        setReady(false);
        return;
      }
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: { lat: 16.0, lng: 108.0 },
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      infoRef.current = new google.maps.InfoWindow();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Redraw pins whenever the filtered set changes, and refit to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !window.google) return;

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];

    for (const option of located) {
      const color = CATEGORY_COLOR[option.category ?? "other"] ?? CATEGORY_COLOR.other;
      const marker = new google.maps.Marker({
        map,
        position: { lat: option.lat!, lng: option.lng! },
        title: option.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: option.status === "rejected" ? 0.35 : 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => {
        const label =
          s.categories[option.category as keyof typeof s.categories] ??
          s.categories.other;
        const links = [
          option.booking_url
            ? `<a href="${option.booking_url}" target="_blank" rel="noopener noreferrer">${s.book}</a>`
            : "",
          option.maps_url
            ? `<a href="${option.maps_url}" target="_blank" rel="noopener noreferrer">${s.onMap}</a>`
            : "",
        ]
          .filter(Boolean)
          .join(" · ");

        infoRef.current?.setContent(
          `<div dir="rtl" style="font-family:inherit;max-width:220px">` +
            `<strong>${escapeHtml(option.title)}</strong><br/>` +
            `<span style="font-size:12px;color:#666">${escapeHtml(label)}` +
            `${option.area ? " · " + escapeHtml(option.area) : ""}</span>` +
            (option.note
              ? `<p style="margin:6px 0 0;font-size:12px">${escapeHtml(option.note)}</p>`
              : "") +
            (links ? `<p style="margin:6px 0 0;font-size:12px">${links}</p>` : "") +
            `</div>`
        );
        infoRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    }

    const box = boundsOf(located);
    if (box) {
      const bounds = new google.maps.LatLngBounds(
        { lat: box.south, lng: box.west },
        { lat: box.north, lng: box.east }
      );
      map.fitBounds(bounds, 48);
      // A single pin fits to maximum zoom, which is disorienting.
      if (located.length === 1) map.setZoom(14);
    }
  }, [located, ready, s]);

  if (ready === false) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
        {s.mapUnavailable}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-[60vh] w-full overflow-hidden rounded-2xl border border-line bg-paper-deep"
      />

      {/* The honest counter: pins only exist for options that were resolved to
          coordinates, so say how many are missing rather than quietly
          showing a partial map. */}
      {unlocatedCount > 0 && (
        <div className="rounded-2xl border border-line bg-white p-3">
          <p className="text-xs text-ink-soft">
            {s.mapUnlocated.replace("{n}", String(unlocatedCount))}
          </p>
          {gaveUpCount > 0 && (
            <p className="mt-1 text-xs text-ink-faint">
              {s.mapGaveUp.replace("{n}", String(gaveUpCount))}
            </p>
          )}
          <button
            type="button"
            onClick={onLocate}
            disabled={locating !== null}
            className="mt-2 w-full rounded-xl bg-sea py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {locating ?? s.mapLocate}
          </button>
        </div>
      )}
    </div>
  );
}

/** InfoWindow takes an HTML string, and titles/notes come from pasted posts —
 *  untrusted text. Escape rather than interpolate raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
