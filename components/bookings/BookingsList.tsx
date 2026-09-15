"use client";

import { useState, type ComponentType } from "react";
import {
  AttractionIcon,
  BedIcon,
  CalendarIcon,
  CarIcon,
  FileIcon,
  type IconProps,
  LinkIcon,
  MailIcon,
  PinIcon,
  PlaneIcon,
  TrainIcon,
} from "@/components/icons";
import { getBookingFileUrl } from "@/lib/data/bookings";
import { formatDate, formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, BookingStatus, BookingType } from "@/lib/types";

const TYPE_ICON: Record<BookingType, ComponentType<IconProps>> = {
  flight: PlaneIcon,
  hotel: BedIcon,
  train: TrainIcon,
  attraction: AttractionIcon,
  car_rental: CarIcon,
  other: PinIcon,
};

const STATUS_CLASS: Record<BookingStatus, string> = {
  booked: "bg-paper-deep text-ink-soft",
  paid: "bg-sea-tint text-sea-deep",
  cancelled: "bg-alert-tint text-alert",
};

export function BookingsList({
  bookings,
  onAdd,
  onImportMail,
  onEdit,
  onAddToDay,
  onError,
}: {
  bookings: Booking[];
  onAdd: () => void;
  onImportMail: () => void;
  onEdit: (booking: Booking) => void;
  onAddToDay: (booking: Booking) => void;
  onError: () => void;
}) {
  return (
    <div className="space-y-3 pb-8">
      {bookings.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.bookings.empty}
        </p>
      )}
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          onEdit={() => onEdit(booking)}
          onAddToDay={() => onAddToDay(booking)}
          onError={onError}
        />
      ))}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl bg-sea py-3 text-sm font-bold text-white hover:bg-sea-deep"
        >
          {strings.bookings.add}
        </button>
        {/* Typing a confirmation in by hand is the slow path, so the fast one
            sits next to it rather than behind a menu.

            Shown even when Google is not configured, and the sheet says so on
            open. Hiding it was worse: a missing env var produced a feature that
            was simply absent, with nothing on screen to explain why - which is
            indistinguishable from a failed deploy or the wrong tab. The Google
            Photos import already makes this choice. */}
        <button
          type="button"
          onClick={onImportMail}
          className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-sm font-bold text-ink-soft hover:bg-paper-deep"
        >
          <MailIcon className="h-[17px] w-[17px]" />
          {strings.mailImport.open}
        </button>
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  onEdit,
  onAddToDay,
  onError,
}: {
  booking: Booking;
  onEdit: () => void;
  onAddToDay: () => void;
  onError: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const TypeIcon = TYPE_ICON[booking.type];
  // Bookings now project onto the days they cover. The two cases that cannot
  // be projected say so here, on the card, rather than leaving someone to
  // wonder why a booking they can see is missing from the plan.
  const notOnPlan = !booking.start_date
    ? strings.bookings.missingStartDate
    : booking.status === "cancelled"
      ? strings.bookings.cancelledHidden
      : null;

  async function openFile() {
    if (!booking.file_path || opening) return;
    setOpening(true);
    try {
      const url = await getBookingFileUrl(booking.file_path);
      window.open(url, "_blank", "noopener");
    } catch {
      onError();
    } finally {
      setOpening(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-line bg-white p-3">
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-start justify-between gap-2 text-start"
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] bg-sea-tint text-sea-deep">
            <TypeIcon className="h-[17px] w-[17px]" strokeWidth={1.7} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">
              {booking.title}
            </span>
            <span className="block text-xs text-ink-soft">
              {strings.bookings.types[booking.type]}
              {booking.start_date && (
                <>
                  {" · "}
                  <span dir="ltr">
                    {formatDate(booking.start_date)}
                    {booking.end_date && booking.end_date !== booking.start_date
                      ? ` - ${formatDate(booking.end_date)}`
                      : ""}
                  </span>
                </>
              )}
              {booking.confirmation_code && (
                <>
                  {" · "}
                  <span dir="ltr">{booking.confirmation_code}</span>
                </>
              )}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[booking.status]}`}
          >
            {strings.bookings.statuses[booking.status]}
          </span>
          {booking.cost != null && (
            <span className="text-sm font-semibold text-ink" dir="ltr">
              {formatMoney(booking.cost, booking.currency ?? "ILS")}
            </span>
          )}
        </span>
      </button>

      {notOnPlan && (
        <p className="mt-1.5 text-[11.5px] text-ink-soft">{notOnPlan}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-2 text-xs font-semibold">
        {booking.file_path && (
          <button
            type="button"
            onClick={() => void openFile()}
            disabled={opening}
            className="flex items-center gap-1.5 rounded-lg bg-paper-deep px-2.5 py-1.5 text-ink hover:bg-line disabled:opacity-50"
          >
            <FileIcon className="h-3.5 w-3.5" />
            {strings.bookings.openFile}
          </button>
        )}
        {booking.link_url && (
          <a
            href={booking.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-paper-deep px-2.5 py-1.5 text-ink hover:bg-line"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {strings.bookings.openLink}
          </a>
        )}
        <button
          type="button"
          onClick={onAddToDay}
          className="flex items-center gap-1.5 rounded-lg bg-sea-tint px-2.5 py-1.5 text-sea hover:bg-sea-tint"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {strings.bookings.addToDay}
        </button>
      </div>
    </section>
  );
}
