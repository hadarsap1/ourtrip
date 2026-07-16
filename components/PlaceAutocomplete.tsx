"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/places";
import { strings } from "@/lib/strings";

export type PlaceSelection = {
  name: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  countryCode: string | null;
};

// Google Places autocomplete over a plain text field. Without an API key (or
// offline) it behaves as a regular free-text input.
export function PlaceAutocomplete({
  id,
  value,
  onChange,
  onSelect,
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: PlaceSelection) => void;
}) {
  const [predictions, setPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [ready, setReady] = useState(false);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps().then((g) => {
      if (cancelled || !g) return;
      autocompleteRef.current = new g.maps.places.AutocompleteService();
      // PlacesService requires an element; a detached div is enough for getDetails.
      placesRef.current = new g.maps.places.PlacesService(
        document.createElement("div")
      );
      setReady(true);
    });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleInput(text: string) {
    onChange(text);
    if (!ready || !autocompleteRef.current || text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sessionRef.current ??=
        new google.maps.places.AutocompleteSessionToken();
      autocompleteRef.current?.getPlacePredictions(
        { input: text, sessionToken: sessionRef.current },
        (preds) => setPredictions(preds ?? [])
      );
    }, 250);
  }

  function handlePick(p: google.maps.places.AutocompletePrediction) {
    setPredictions([]);
    const fallback: PlaceSelection = {
      name: p.structured_formatting?.main_text ?? p.description,
      lat: null,
      lng: null,
      placeId: p.place_id,
      countryCode: null,
    };
    onChange(fallback.name);

    const service = placesRef.current;
    if (!service) {
      onSelect(fallback);
      return;
    }
    service.getDetails(
      {
        placeId: p.place_id,
        fields: ["name", "geometry.location", "address_components"],
        sessionToken: sessionRef.current ?? undefined,
      },
      (place, status) => {
        sessionRef.current = null;
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          onSelect(fallback);
          return;
        }
        const name = place.name ?? fallback.name;
        const country =
          place.address_components?.find((c) => c.types.includes("country"))
            ?.short_name ?? null;
        onChange(name);
        onSelect({
          name,
          lat: place.geometry?.location?.lat() ?? null,
          lng: place.geometry?.location?.lng() ?? null,
          placeId: p.place_id,
          countryCode: country,
        });
      }
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        placeholder={strings.places.searchPlaceholder}
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
      />
      {predictions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onClick={() => handlePick(p)}
                className="block w-full px-3 py-2.5 text-start text-sm hover:bg-slate-50"
              >
                <span className="font-medium">
                  {p.structured_formatting?.main_text ?? p.description}
                </span>
                {p.structured_formatting?.secondary_text && (
                  <span className="block text-xs text-slate-500">
                    {p.structured_formatting.secondary_text}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
