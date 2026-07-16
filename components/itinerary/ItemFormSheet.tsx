"use client";

import { useState } from "react";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { Sheet } from "@/components/Sheet";
import { createItem, deleteItem, updateItem } from "@/lib/data/itinerary";
import { strings } from "@/lib/strings";
import type { Booking, ItemStatus, ItineraryItem } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-slate-600";
const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none";

export function ItemFormSheet({
  open,
  dayId,
  item,
  itemCount,
  bookings,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dayId: string;
  item: ItineraryItem | null;
  itemCount: number;
  bookings: Booking[];
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  if (!open) return null;
  // key remounts the form per item, so state initializes from props cleanly
  return (
    <ItemForm
      key={item?.id ?? "new"}
      dayId={dayId}
      item={item}
      itemCount={itemCount}
      bookings={bookings}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function ItemForm({
  dayId,
  item,
  itemCount,
  bookings,
  onClose,
  onSubmit,
}: {
  dayId: string;
  item: ItineraryItem | null;
  itemCount: number;
  bookings: Booking[];
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [startTime, setStartTime] = useState(
    item?.start_time ? item.start_time.slice(0, 5) : ""
  );
  const [endTime, setEndTime] = useState(
    item?.end_time ? item.end_time.slice(0, 5) : ""
  );
  const [locationName, setLocationName] = useState(item?.location_name ?? "");
  const [place, setPlace] = useState<{
    lat: number | null;
    lng: number | null;
    placeId: string | null;
  }>({
    lat: item?.lat ?? null,
    lng: item?.lng ?? null,
    placeId: item?.place_id ?? null,
  });
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [isOutdoor, setIsOutdoor] = useState(item?.is_outdoor ?? false);
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? "planned");
  const [bookingId, setBookingId] = useState<string>(item?.booking_id ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: title.trim(),
      start_time: startTime || null,
      end_time: endTime || null,
      location_name: locationName.trim() || null,
      lat: place.lat,
      lng: place.lng,
      place_id: place.placeId,
      notes: notes.trim() || null,
      is_outdoor: isOutdoor,
      status,
      booking_id: bookingId || null,
    };
    onSubmit(
      item
        ? () => updateItem(item.id, payload)
        : () => createItem({ day_id: dayId, sort_order: itemCount, ...payload })
    );
  }

  function handleDelete() {
    if (!item) return;
    if (!confirm(strings.itinerary.deleteItemConfirm)) return;
    onSubmit(() => deleteItem(item.id));
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? strings.itinerary.editItem : strings.itinerary.addItem}
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="item-title" className={labelClass}>
            {strings.itinerary.itemTitle}
          </label>
          <input
            id="item-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="item-start" className={labelClass}>
              {strings.itinerary.startTime}
            </label>
            <input
              id="item-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="item-end" className={labelClass}>
              {strings.itinerary.endTime}
            </label>
            <input
              id="item-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
        </div>

        <div>
          <label htmlFor="item-location" className={labelClass}>
            {strings.itinerary.location}
          </label>
          <PlaceAutocomplete
            id="item-location"
            value={locationName}
            onChange={setLocationName}
            onSelect={(p) =>
              setPlace({ lat: p.lat, lng: p.lng, placeId: p.placeId })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="item-status" className={labelClass}>
              {strings.itinerary.status}
            </label>
            <select
              id="item-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ItemStatus)}
              className={inputClass}
            >
              <option value="planned">{strings.itinerary.statusPlanned}</option>
              <option value="done">{strings.itinerary.statusDone}</option>
              <option value="cancelled">
                {strings.itinerary.statusCancelled}
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="item-booking" className={labelClass}>
              {strings.itinerary.linkedBooking}
            </label>
            <select
              id="item-booking"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className={inputClass}
            >
              <option value="">{strings.common.none}</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={isOutdoor}
            onChange={(e) => setIsOutdoor(e.target.checked)}
            className="h-4 w-4 accent-teal-600"
          />
          {strings.itinerary.outdoor}
        </label>

        <div>
          <label htmlFor="item-notes" className={labelClass}>
            {strings.itinerary.notes}
          </label>
          <textarea
            id="item-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700"
          >
            {strings.common.save}
          </button>
          {item && (
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
