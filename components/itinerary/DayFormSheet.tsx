"use client";

import { useState } from "react";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { Sheet } from "@/components/Sheet";
import { createDay, deleteDay, updateDay } from "@/lib/data/itinerary";
import { strings } from "@/lib/strings";
import type { ItineraryDay } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

export function DayFormSheet({
  open,
  tripId,
  day,
  onClose,
  onSubmit,
}: {
  open: boolean;
  tripId: string;
  day: ItineraryDay | null;
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  if (!open) return null;
  // key remounts the form per day, so state initializes from props cleanly
  return (
    <DayForm
      key={day?.id ?? "new"}
      tripId={tripId}
      day={day}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function DayForm({
  tripId,
  day,
  onClose,
  onSubmit,
}: {
  tripId: string;
  day: ItineraryDay | null;
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  const [date, setDate] = useState(day?.date ?? "");
  const [locationName, setLocationName] = useState(day?.location_name ?? "");
  const [countryCode, setCountryCode] = useState(day?.country_code ?? "");
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: day?.lat ?? null,
    lng: day?.lng ?? null,
  });
  const [notes, setNotes] = useState(day?.notes ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      date,
      location_name: locationName.trim() || null,
      country_code: countryCode.trim().toUpperCase() || null,
      lat: coords.lat,
      lng: coords.lng,
      notes: notes.trim() || null,
    };
    onSubmit(
      day
        ? () => updateDay(day.id, payload)
        : () => createDay({ trip_id: tripId, ...payload })
    );
  }

  function handleDelete() {
    if (!day) return;
    if (!confirm(strings.itinerary.deleteDayConfirm)) return;
    onSubmit(() => deleteDay(day.id));
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={day ? strings.itinerary.editDay : strings.itinerary.addDay}
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="day-date" className={labelClass}>
            {strings.itinerary.date}
          </label>
          <input
            id="day-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="day-location" className={labelClass}>
            {strings.itinerary.location}
          </label>
          <PlaceAutocomplete
            id="day-location"
            value={locationName}
            onChange={setLocationName}
            onSelect={(place) => {
              setCoords({ lat: place.lat, lng: place.lng });
              if (place.countryCode) setCountryCode(place.countryCode);
            }}
          />
        </div>

        <div>
          <label htmlFor="day-country" className={labelClass}>
            {strings.itinerary.countryCode}
          </label>
          <input
            id="day-country"
            type="text"
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            placeholder={strings.itinerary.countryCodeHint}
            className={inputClass}
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="day-notes" className={labelClass}>
            {strings.itinerary.notes}
          </label>
          <textarea
            id="day-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep"
          >
            {strings.common.save}
          </button>
          {day && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-600 hover:bg-rose-50"
            >
              {strings.common.delete}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
