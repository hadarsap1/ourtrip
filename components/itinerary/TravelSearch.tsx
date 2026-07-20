"use client";

import { useState } from "react";
import { CURRENCIES } from "@/lib/currencies";
import { createBooking } from "@/lib/data/bookings";
import {
  TravelSearchError,
  searchFlights,
  searchHotels,
  type TravelResult,
} from "@/lib/data/travelSearch";
import { strings } from "@/lib/strings";
import type { Booking } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

const CABINS: { value: string; label: string }[] = [
  { value: "ECONOMY", label: strings.travelSearch.cabinEconomy },
  { value: "PREMIUM_ECONOMY", label: strings.travelSearch.cabinPremium },
  { value: "BUSINESS", label: strings.travelSearch.cabinBusiness },
  { value: "FIRST", label: strings.travelSearch.cabinFirst },
];

// Maps a stable error code from the Edge Function to a Hebrew message.
function messageFor(code: string): string {
  switch (code) {
    case "not_configured":
      return strings.travelSearch.notConfigured;
    case "forbidden":
      return strings.travelSearch.ownersOnly;
    default:
      return strings.travelSearch.error;
  }
}

export function TravelSearch({
  tripId,
  defaultCurrency,
  onSaved,
  onError,
}: {
  tripId: string;
  defaultCurrency: string;
  onSaved: (booking: Booking) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"flights" | "hotels">("flights");

  // currency shared across both forms; seeded from the trip's base currency
  const initialCurrency = CURRENCIES.includes(
    defaultCurrency as (typeof CURRENCIES)[number]
  )
    ? defaultCurrency
    : "USD";
  const [currency, setCurrency] = useState(initialCurrency);

  // flight form
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [tripType, setTripType] = useState<"round" | "oneway">("round");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [cabin, setCabin] = useState("ECONOMY");

  // hotel form
  const [hotelDest, setHotelDest] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<TravelResult[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (mode === "flights") {
      if (!origin.trim() || !destination.trim() || !departureDate) {
        onError(strings.travelSearch.needFlightFields);
        return;
      }
    } else if (!hotelDest.trim() || !checkIn || !checkOut) {
      onError(strings.travelSearch.needHotelFields);
      return;
    }

    setLoading(true);
    setSearched(true);
    setResults([]);
    setSavedIds(new Set());
    try {
      const found =
        mode === "flights"
          ? await searchFlights({
              origin,
              destination,
              departure_date: departureDate,
              return_date: tripType === "round" ? returnDate || undefined : undefined,
              cabin,
              currency,
            })
          : await searchHotels({
              destination: hotelDest,
              check_in: checkIn,
              check_out: checkOut,
              currency,
            });
      setResults(found);
    } catch (err) {
      const code = err instanceof TravelSearchError ? err.code : "";
      onError(messageFor(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(result: TravelResult) {
    try {
      const saved = await createBooking({
        trip_id: tripId,
        type: result.kind,
        title: result.title,
        start_date: result.start_date,
        end_date: result.end_date,
        cost: result.price,
        currency: result.price != null ? result.currency ?? currency : null,
        status: "booked",
        link_url: result.link_url,
        details: result.details,
      });
      setSavedIds((prev) => new Set(prev).add(result.id));
      onSaved(saved);
    } catch {
      onError(strings.common.error);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-lg font-bold">{strings.travelSearch.title}</h1>
        <p className="text-sm text-ink-soft">{strings.travelSearch.subtitle}</p>
      </div>

      {/* flights / hotels toggle */}
      <div className="grid grid-cols-2 rounded-xl bg-line p-1 text-sm font-semibold">
        {(
          [
            ["flights", strings.travelSearch.tabFlights],
            ["hotels", strings.travelSearch.tabHotels],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setSearched(false);
              setResults([]);
            }}
            className={`rounded-lg py-2 transition-colors ${
              mode === key ? "bg-white text-sea shadow" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void handleSearch(e)} className="space-y-3">
        {mode === "flights" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ts-origin" className={labelClass}>
                  {strings.travelSearch.origin}
                </label>
                <input
                  id="ts-origin"
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={strings.travelSearch.originHint}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ts-dest" className={labelClass}>
                  {strings.travelSearch.destination}
                </label>
                <input
                  id="ts-dest"
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={strings.travelSearch.destinationHint}
                  className={inputClass}
                />
              </div>
            </div>
            {/* round-trip / one-way */}
            <div className="grid grid-cols-2 rounded-xl bg-line p-1 text-sm font-semibold">
              {(
                [
                  ["round", strings.travelSearch.tripRoundTrip],
                  ["oneway", strings.travelSearch.tripOneWay],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTripType(key)}
                  className={`rounded-lg py-1.5 transition-colors ${
                    tripType === key ? "bg-white text-sea shadow" : "text-ink-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ts-dep" className={labelClass}>
                  {strings.travelSearch.departureDate}
                </label>
                <input
                  id="ts-dep"
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              {tripType === "round" && (
                <div>
                  <label htmlFor="ts-ret" className={labelClass}>
                    {strings.travelSearch.returnDate}
                  </label>
                  <input
                    id="ts-ret"
                    type="date"
                    value={returnDate}
                    min={departureDate || undefined}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className={inputClass}
                    dir="ltr"
                  />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="ts-cabin" className={labelClass}>
                {strings.travelSearch.cabin}
              </label>
              <select
                id="ts-cabin"
                value={cabin}
                onChange={(e) => setCabin(e.target.value)}
                className={inputClass}
              >
                {CABINS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="ts-hdest" className={labelClass}>
                {strings.travelSearch.hotelDestination}
              </label>
              <input
                id="ts-hdest"
                type="text"
                value={hotelDest}
                onChange={(e) => setHotelDest(e.target.value)}
                placeholder={strings.travelSearch.hotelDestinationHint}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ts-cin" className={labelClass}>
                  {strings.travelSearch.checkIn}
                </label>
                <input
                  id="ts-cin"
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label htmlFor="ts-cout" className={labelClass}>
                  {strings.travelSearch.checkOut}
                </label>
                <input
                  id="ts-cout"
                  type="date"
                  value={checkOut}
                  min={checkIn || undefined}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
          </>
        )}

        {/* passengers are fixed for the family — shown, not editable */}
        <div className="flex items-center gap-2 rounded-xl bg-sea-tint/50 px-3 py-2 text-sm text-ink-soft">
          <span aria-hidden="true">👨‍👩‍👧‍👦</span>
          <span>
            <span className="font-medium text-ink">{strings.travelSearch.passengers}: </span>
            {strings.travelSearch.passengersFixed}
          </span>
        </div>

        <div>
          <label htmlFor="ts-currency" className={labelClass}>
            {strings.travelSearch.currency}
          </label>
          <select
            id="ts-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
        >
          {loading ? strings.travelSearch.searching : strings.travelSearch.search}
        </button>
      </form>

      {/* results */}
      {searched && !loading && results.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.travelSearch.empty}
        </p>
      )}

      <ul className="space-y-3">
        {results.map((r) => {
          const isSaved = savedIds.has(r.id);
          return (
            <li key={r.id} className="ot-card overflow-hidden">
              <div className="flex gap-3 p-3">
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{r.title}</p>
                  {r.subtitle && (
                    <p className="mt-0.5 text-sm text-ink-soft">{r.subtitle}</p>
                  )}
                  {r.price != null && (
                    <p className="mt-1 font-bold text-sea-deep" dir="ltr">
                      {r.price.toLocaleString("he-IL")} {r.currency}
                      {r.kind === "hotel" && (
                        <span className="text-xs font-normal text-ink-soft">
                          {" "}
                          {strings.travelSearch.perNight}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 border-t border-line p-2">
                <button
                  type="button"
                  onClick={() => void handleSave(r)}
                  disabled={isSaved}
                  className="flex-1 rounded-lg bg-sea-tint py-2 text-sm font-semibold text-sea disabled:opacity-60"
                >
                  {isSaved
                    ? strings.travelSearch.saved
                    : strings.travelSearch.saveAsBooking}
                </button>
                {r.link_url && (
                  <a
                    href={r.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft"
                  >
                    {strings.travelSearch.openLink}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
