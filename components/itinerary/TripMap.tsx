"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/places";
import { DAY_COLORS } from "@/lib/data/map";
import { boundsOfPoints, legPoint, type LegPoint } from "@/lib/legGeo";
import type { OptionForAreas } from "@/lib/data/segments";
import type { LegOverview } from "@/lib/itineraryOverview";
import { countryName } from "@/lib/data/emergency";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";

/**
 * The trip from above: one pin per leg the app can actually place, in order.
 *
 * WHAT IS DELIBERATELY NOT DRAWN. A leg known only to its country is drawn
 * faded, but only while it is the sole leg landing on that centroid. One leg
 * labelled "תאילנד" at the middle of Thailand is a fair picture of it. Four
 * Japanese legs resolving to one identical point in central Japan are not:
 * they would stack into a single unreadable blob on a spot none of them is
 * near, each carrying a town name - the exact failure the geocoder's own
 * header records ("a map that looked populated and was wrong"). Sharing a
 * point is the evidence that the point describes none of them, so they are
 * listed under the map instead, where a tap fixes each for good.
 *
 * THE ROUTE LINE SAYS WHERE IT IS GUESSING. Consecutive placed legs are joined
 * solid; a jump that skips an unplaced leg is dashed, so the line never claims
 * you fly Hoi An to Kyoto when Thailand, Cambodia and the Philippines are in
 * between. The pins carry their real leg number for the same reason - a gap in
 * the numbering is visible.
 */
export function TripMap({
  legs,
  options,
  onOpenLeg,
  onSetLocation,
}: {
  legs: LegOverview[];
  options: OptionForAreas[];
  /** Jump to this leg in the list view. */
  onOpenLeg: (key: string) => void;
  /** Pin a leg that has no position yet. */
  onSetLocation: (leg: LegOverview) => void;
}) {
  const s = strings.itinerary;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);

  // A leg, its number in the trip, and where it sits - if anywhere.
  //
  // A country-level point is kept only when it is the ONLY leg landing on it.
  // One leg in Thailand labelled "תאילנד" is honestly drawn at the middle of
  // Thailand. Four Japanese legs all resolving to the same spot in central
  // Japan are not: they would stack into one unreadable blob of pins, none of
  // which is anywhere near Hakone or Sapporo. Sharing a point is the evidence
  // that the point is not about any of them, and it needs no guessing at what
  // the labels mean.
  const placed = useMemo(() => {
    const rows = legs.map((leg, index) => ({
      leg,
      number: index + 1,
      point: legPoint(leg.stretch, options),
    }));

    const atPoint = new Map<string, number>();
    for (const row of rows) {
      if (!row.point || row.point.precision !== "country") continue;
      const key = pointKey(row.point);
      atPoint.set(key, (atPoint.get(key) ?? 0) + 1);
    }

    return rows.filter(
      (row): row is { leg: LegOverview; number: number; point: LegPoint } =>
        row.point !== null &&
        (row.point.precision !== "country" ||
          atPoint.get(pointKey(row.point)) === 1)
    );
  }, [legs, options]);

  // One colour per country, assigned in the order the trip meets them. Keyed
  // off the data rather than a table of countries, so a route through anywhere
  // else colours itself the same way (CLAUDE.md #9). Reuses the map screen's
  // existing palette instead of inventing a second one.
  const colorOf = useMemo(() => {
    const byCountry = new Map<string, string>();
    for (const leg of legs) {
      const cc = leg.stretch.countryCode;
      if (!cc || byCountry.has(cc)) continue;
      byCountry.set(cc, DAY_COLORS[byCountry.size % DAY_COLORS.length]);
    }
    return (cc: string | null) =>
      (cc && byCountry.get(cc)) || DAY_COLORS[DAY_COLORS.length - 1];
  }, [legs]);

  const unplaced = useMemo(() => {
    const placedKeys = new Set(placed.map((p) => p.leg.key));
    return legs
      .map((leg, index) => ({ leg, number: index + 1 }))
      .filter((row) => !placedKeys.has(row.leg.key));
  }, [legs, placed]);

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
        center: { lat: 16, lng: 108 },
        zoom: 4,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !window.google) return;

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];

    for (const { leg, number, point } of placed) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: leg.stretch.locationName ?? "",
        label: {
          text: String(number),
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          // Bigger for a longer stay, so the shape of the trip carries how
          // long you are anywhere without reading a single number.
          scale: 11 + Math.min(9, leg.dayCount / 5),
          // Colour is the country now. Eight separate Japanese legs were eight
          // identical dots before, which is the opposite of what a map is for.
          fillColor: colorOf(leg.stretch.countryCode),
          // A country-level pin is see-through. It is the whole country, not
          // a place, and it should not read as firmly as one that is.
          fillOpacity: point.precision === "country" ? 0.45 : 1,
          // The leg you are in keeps a heavier ring, since colour is spoken for.
          strokeColor: leg.phase === "current" ? "#22312e" : "#ffffff",
          strokeWeight: leg.phase === "current" ? 3 : 2,
        },
        zIndex: leg.phase === "current" ? 3 : 2,
      });

      marker.addListener("click", () => {
        // The town the pin is standing on leads, and the leg's own label
        // follows it when the two differ. This used to read `locationName ??
        // anchorArea`, so the anchor - the one thing that says WHERE the dot
        // is - could never appear: a pin sitting on Hanoi announced itself as
        // "וייטנאם - צפון" and the word Hanoi was nowhere on the map.
        const town = point.anchorArea;
        const label = leg.stretch.locationName ?? "";
        const heading = town ?? label;
        const sub = town && town !== label ? label : "";
        infoRef.current?.setContent(
          `<div dir="rtl" style="font-family:inherit;max-width:220px">` +
            `<strong>${escapeHtml(heading)}</strong>` +
            (sub ? ` <span style="font-size:12px;color:#666">· ${escapeHtml(sub)}</span>` : "") +
            `<br/>` +
            `<span style="font-size:12px;color:#666">` +
            `${escapeHtml(formatShortDate(leg.stretch.from))} - ${escapeHtml(formatShortDate(leg.stretch.to))}` +
            ` · ${escapeHtml(s.mapPinNights.replace("{n}", String(leg.dayCount)))}` +
            `</span><br/>` +
            (point.precision === "country"
              ? `<span style="font-size:12px;color:#9c6a0e">${escapeHtml(s.mapApprox)}</span><br/>`
              : "") +
            `<span style="font-size:12px;color:#666">${escapeHtml(
              s.legPlanned
                .replace("{done}", String(leg.daysPlanned))
                .replace("{total}", String(leg.dayCount))
            )}</span>` +
            `<p style="margin:6px 0 0"><button type="button" data-leg="${escapeHtml(leg.key)}" ` +
            `style="font:inherit;font-size:12px;font-weight:700;color:#0b5f54;background:none;border:0;padding:0;cursor:pointer">` +
            `${escapeHtml(s.mapPinOpen)}</button></p>` +
            `</div>`
        );
        infoRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    }

    const box = boundsOfPoints(placed.map((p) => p.point));
    if (box) {
      map.fitBounds(
        new google.maps.LatLngBounds(
          { lat: box.south, lng: box.west },
          { lat: box.north, lng: box.east }
        ),
        40
      );
      if (placed.length === 1) map.setZoom(9);
    }
  }, [placed, ready, s, colorOf]);

  // The info window's "open this leg" is plain HTML, so its click is caught
  // here rather than bound to a React handler.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.("[data-leg]");
      const key = target?.getAttribute("data-leg");
      if (key) onOpenLeg(key);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [onOpenLeg]);

  // No Maps key, or the script could not load. The map goes, but the rest of
  // the screen is still worth showing: the legs, and which of them nobody has
  // placed. Returning only the message - which is what this did at first -
  // left the whole view as a single grey sentence.
  const unavailable = ready === false;

  return (
    <div className="space-y-2.5 pb-8">
      {unavailable ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center">
          <p className="text-sm font-semibold text-ink-soft">{s.mapUnavailable}</p>
          <p className="mt-1 text-[12px] text-ink-faint">{s.mapUnavailableHint}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[58vh] w-full overflow-hidden rounded-2xl border border-line bg-paper-deep"
        />
      )}

      {!unavailable && (
        <p className="px-1 text-[11.5px] text-ink-soft">
          {s.mapPlacedCount
            .replace("{placed}", String(placed.length))
            .replace("{total}", String(legs.length))}
        </p>
      )}

      {!unavailable && placed.length > 0 && (
        <section className="rounded-2xl border border-line bg-white p-3">
          <h3 className="mb-2 text-[12.5px] font-extrabold text-ink">
            {s.mapLegend}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {placed.map(({ leg, number, point }) => (
              <li key={leg.key}>
                <button
                  type="button"
                  onClick={() => onOpenLeg(leg.key)}
                  className="flex items-center gap-1.5 rounded-lg bg-paper px-2 py-1 text-[11.5px] active:bg-paper-deep"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: colorOf(leg.stretch.countryCode),
                      opacity: point.precision === "country" ? 0.45 : 1,
                    }}
                  />
                  <span className="font-bold tabular-nums text-ink-soft">
                    {number}
                  </span>
                  <span className="font-semibold text-ink">
                    {point.anchorArea ?? leg.stretch.locationName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Not a footnote: eight of fourteen legs land here, and every one of
          them is a tap away from being on the map. */}
      {(unplaced.length > 0 || unavailable) && (
        <section className="rounded-2xl border border-line bg-white p-3">
          <h3 className="text-[12.5px] font-extrabold text-ink">
            {s.mapMissingTitle}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-soft">
            {unavailable ? s.mapSearchUnavailable : s.mapMissingHint}
          </p>
          <ul className="mt-2 space-y-1.5">
            {unplaced.map(({ leg, number }) => (
              <li
                key={leg.key}
                className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5"
              >
                <span className="w-5 shrink-0 text-[11px] font-bold text-ink-faint tabular-nums">
                  {number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">
                    {leg.stretch.locationName ??
                      (leg.stretch.countryCode
                        ? countryName(leg.stretch.countryCode)
                        : "")}
                  </span>
                  <span className="block text-[11px] text-ink-soft" dir="ltr">
                    {formatShortDate(leg.stretch.from)} -{" "}
                    {formatShortDate(leg.stretch.to)}
                  </span>
                </span>
                {/* Hidden without a key: the sheet behind it searches through
                    Places, so the button would open a dead end. */}
                {!unavailable && (
                  <button
                    type="button"
                    onClick={() => onSetLocation(leg)}
                    className="shrink-0 rounded-lg bg-sea-tint px-2.5 py-1.5 text-[11.5px] font-bold text-sea-deep active:bg-sea-tint/70"
                  >
                    {s.mapSetLocation}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Two legs count as sharing a point when they round to the same spot. The
 *  country centroid is computed identically for both, so this is an equality
 *  check with a tolerance for float noise rather than a proximity test. */
function pointKey(point: LegPoint): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

/** InfoWindow takes an HTML string and leg labels are free text. Escape. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
