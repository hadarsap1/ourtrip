"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  createBooking,
  deleteBooking,
  updateBooking,
  uploadBookingFile,
} from "@/lib/data/bookings";
import { strings } from "@/lib/strings";
import type { Booking, BookingStatus, BookingType } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-slate-600";
const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none";

const BOOKING_TYPES: BookingType[] = [
  "flight",
  "hotel",
  "train",
  "attraction",
  "car_rental",
  "other",
];

const BOOKING_STATUSES: BookingStatus[] = ["booked", "paid", "cancelled"];

const CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "THB",
  "VND", "KRW", "SGD", "AUD", "NZD", "INR",
];

type Details = Record<string, string>;

export function BookingFormSheet({
  open,
  tripId,
  booking,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  tripId: string;
  booking: Booking | null;
  onClose: () => void;
  onSaved: (booking: Booking, isNew: boolean) => void;
  onError: (message: string) => void;
}) {
  if (!open) return null;
  // key remounts the form per booking, so state initializes from props cleanly
  return (
    <BookingForm
      key={booking?.id ?? "new"}
      tripId={tripId}
      booking={booking}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
    />
  );
}

function BookingForm({
  tripId,
  booking,
  onClose,
  onSaved,
  onError,
}: {
  tripId: string;
  booking: Booking | null;
  onClose: () => void;
  onSaved: (booking: Booking, isNew: boolean) => void;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<BookingType>(booking?.type ?? "hotel");
  const [title, setTitle] = useState(booking?.title ?? "");
  const [startDate, setStartDate] = useState(booking?.start_date ?? "");
  const [endDate, setEndDate] = useState(booking?.end_date ?? "");
  const [confirmationCode, setConfirmationCode] = useState(
    booking?.confirmation_code ?? ""
  );
  const [cost, setCost] = useState(
    booking?.cost != null ? String(booking.cost) : ""
  );
  const [currency, setCurrency] = useState(booking?.currency ?? "ILS");
  const [status, setStatus] = useState<BookingStatus>(
    booking?.status ?? "booked"
  );
  const [linkUrl, setLinkUrl] = useState(booking?.link_url ?? "");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [details, setDetails] = useState<Details>(
    booking && typeof booking.details === "object" && booking.details !== null
      ? (booking.details as Details)
      : {}
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function setDetail(key: string, value: string) {
    setDetails((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        type,
        title: title.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        confirmation_code: confirmationCode.trim() || null,
        cost: cost.trim() === "" ? null : Number(cost),
        currency: cost.trim() === "" ? null : currency,
        status,
        link_url: linkUrl.trim() || null,
        notes: notes.trim() || null,
        details,
      };

      let saved: Booking;
      if (booking) {
        await updateBooking(booking.id, payload);
        saved = { ...booking, ...payload };
      } else {
        saved = await createBooking({ trip_id: tripId, ...payload });
      }

      if (file) {
        const path = await uploadBookingFile(saved.id, file);
        saved = { ...saved, file_path: path };
      }

      onSaved(saved, booking === null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "");
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!booking || saving) return;
    if (!confirm(strings.bookings.deleteConfirm)) return;
    setSaving(true);
    deleteBooking(booking.id)
      .then(() => onSaved(booking, false))
      .catch((e) => {
        onError(e instanceof Error ? e.message : "");
        setSaving(false);
      });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={booking ? strings.bookings.edit : strings.bookings.add}
    >
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-type" className={labelClass}>
              {strings.bookings.type}
            </label>
            <select
              id="bk-type"
              value={type}
              onChange={(e) => setType(e.target.value as BookingType)}
              className={inputClass}
            >
              {BOOKING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {strings.bookings.types[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bk-status" className={labelClass}>
              {strings.bookings.status}
            </label>
            <select
              id="bk-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus)}
              className={inputClass}
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {strings.bookings.statuses[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="bk-title" className={labelClass}>
            {strings.bookings.title}
          </label>
          <input
            id="bk-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-start" className={labelClass}>
              {strings.bookings.startDate}
            </label>
            <input
              id="bk-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="bk-end" className={labelClass}>
              {strings.bookings.endDate}
            </label>
            <input
              id="bk-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
        </div>

        {/* type-specific fields → details jsonb */}
        {type === "flight" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bk-flight-no" className={labelClass}>
                {strings.bookings.flightNumber}
              </label>
              <input
                id="bk-flight-no"
                type="text"
                value={details.flight_number ?? ""}
                onChange={(e) => setDetail("flight_number", e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="bk-terminal" className={labelClass}>
                {strings.bookings.terminal}
              </label>
              <input
                id="bk-terminal"
                type="text"
                value={details.terminal ?? ""}
                onChange={(e) => setDetail("terminal", e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
          </div>
        )}
        {type === "hotel" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bk-checkin" className={labelClass}>
                  {strings.bookings.checkIn}
                </label>
                <input
                  id="bk-checkin"
                  type="time"
                  value={details.check_in ?? ""}
                  onChange={(e) => setDetail("check_in", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label htmlFor="bk-checkout" className={labelClass}>
                  {strings.bookings.checkOut}
                </label>
                <input
                  id="bk-checkout"
                  type="time"
                  value={details.check_out ?? ""}
                  onChange={(e) => setDetail("check_out", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <label htmlFor="bk-address" className={labelClass}>
                {strings.bookings.address}
              </label>
              <input
                id="bk-address"
                type="text"
                value={details.address ?? ""}
                onChange={(e) => setDetail("address", e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-cost" className={labelClass}>
              {strings.bookings.cost}
            </label>
            <input
              id="bk-cost"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="bk-currency" className={labelClass}>
              {strings.bookings.currency}
            </label>
            <select
              id="bk-currency"
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
        </div>

        <div>
          <label htmlFor="bk-confirmation" className={labelClass}>
            {strings.bookings.confirmationCode}
          </label>
          <input
            id="bk-confirmation"
            type="text"
            value={confirmationCode}
            onChange={(e) => setConfirmationCode(e.target.value)}
            className={inputClass}
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="bk-link" className={labelClass}>
            {strings.bookings.linkUrl}
          </label>
          <input
            id="bk-link"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://"
            className={inputClass}
            dir="ltr"
          />
        </div>

        <div>
          <span className={labelClass}>
            {booking?.file_path
              ? strings.bookings.replaceFile
              : strings.bookings.attachFile}
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-700"
          />
        </div>

        <div>
          <label htmlFor="bk-notes" className={labelClass}>
            {strings.bookings.notes}
          </label>
          <textarea
            id="bk-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving && file
              ? strings.bookings.uploading
              : strings.common.save}
          </button>
          {booking && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              {strings.common.delete}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
