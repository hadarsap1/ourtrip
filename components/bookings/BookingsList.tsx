"use client";

import { useMemo, useState, type ComponentType } from "react";
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
import {
  groupBookingsByLeg,
  type BookingGroup,
  type BookingPlacement,
} from "@/lib/bookingPlacement";
import { getBookingFileUrl } from "@/lib/data/bookings";
import { countryName } from "@/lib/data/emergency";
import type { Stretch } from "@/lib/data/segments";
import { formatDate, formatMoney, formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type {
  Booking,
  BookingStatus,
  BookingType,
  ItineraryDay,
} from "@/lib/types";

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

/** What a leg is called on screen: its own label, else the country, else a
 *  placeholder - a heading reading "null" is worse than one reading "יעד לא
 *  מוגדר", and a trip this long has days that were never labelled. */
function legLabel(stretch: Stretch): string {
  if (stretch.locationName) return stretch.locationName;
  if (stretch.countryCode) return countryName(stretch.countryCode);
  return strings.bookings.legUnknown;
}

/** The booking's address as entered on it. Lives in the `details` jsonb, which
 *  is untyped, so it is read defensively. */
function addressOf(booking: Booking): string | null {
  const details = booking.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const address = (details as Record<string, unknown>).address;
  return typeof address === "string" && address.trim() ? address.trim() : null;
}

export function BookingsList({
  bookings,
  days,
  onAdd,
  onImportMail,
  onEdit,
  onAddToDay,
  onError,
}: {
  bookings: Booking[];
  /** The trip's days, which is what turns a booking's dates into a place. */
  days: ItineraryDay[];
  onAdd: () => void;
  onImportMail: () => void;
  onEdit: (booking: Booking) => void;
  onAddToDay: (booking: Booking) => void;
  onError: () => void;
}) {
  const groups = useMemo(
    () => groupBookingsByLeg(bookings, days),
    [bookings, days]
  );

  return (
    <div className="space-y-4 pb-8">
      {bookings.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.bookings.empty}
        </p>
      )}

      {groups.map((group) => (
        <LegSection
          key={group.key}
          group={group}
          onEdit={onEdit}
          onAddToDay={onAddToDay}
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

/**
 * One leg of the trip and its bookings.
 *
 * The heading sticks: on a phone a leg can be four cards tall, and the whole
 * point of the grouping is that the answer to "where is this one" is never off
 * screen.
 */
function LegSection({
  group,
  onEdit,
  onAddToDay,
  onError,
}: {
  group: BookingGroup;
  onEdit: (booking: Booking) => void;
  onAddToDay: (booking: Booking) => void;
  onError: () => void;
}) {
  const { stretch } = group;
  const count = group.bookings.length;
  const countLabel =
    count === 1
      ? strings.bookings.legCountOne
      : strings.bookings.legCount.replace("{n}", String(count));

  return (
    <section>
      <div className="sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-paper/95 px-1 py-1.5 backdrop-blur">
        <h2 className="text-[13px] font-extrabold text-ink">
          {stretch ? legLabel(stretch) : strings.bookings.legUnplaced}
        </h2>
        {stretch?.countryCode && (
          <span className="rounded bg-white px-1.5 py-px text-[10px] font-bold text-sea">
            {stretch.countryCode}
          </span>
        )}
        {stretch && (
          <span className="text-[11px] font-semibold text-ink-soft" dir="ltr">
            {formatShortDate(stretch.from)}
            {stretch.to !== stretch.from && ` - ${formatShortDate(stretch.to)}`}
          </span>
        )}
        <span className="text-[11px] text-ink-soft">{countLabel}</span>
      </div>

      {!stretch && (
        <p className="mb-2 rounded-xl bg-alert-tint px-3 py-2 text-[11.5px] text-alert">
          {strings.bookings.legUnplacedHint}
        </p>
      )}

      <div className="space-y-3">
        {group.bookings.map((placement) => (
          <BookingCard
            key={placement.booking.id}
            placement={placement}
            onEdit={() => onEdit(placement.booking)}
            onAddToDay={() => onAddToDay(placement.booking)}
            onError={onError}
          />
        ))}
      </div>
    </section>
  );
}

function BookingCard({
  placement,
  onEdit,
  onAddToDay,
  onError,
}: {
  placement: BookingPlacement;
  onEdit: () => void;
  onAddToDay: () => void;
  onError: () => void;
}) {
  const { booking } = placement;
  const [opening, setOpening] = useState(false);
  const TypeIcon = TYPE_ICON[booking.type];
  // Bookings now project onto the days they cover. The two cases that cannot
  // be projected say so here, on the card, rather than leaving someone to
  // wonder why a booking they can see is missing from the plan.
  const notOnPlan = !booking.start_date
    ? strings.bookings.missingStartDate
    : placement.unplaced === "outside_plan"
      ? strings.bookings.outsidePlan
      : booking.status === "cancelled"
        ? strings.bookings.cancelledHidden
        : null;

  // The leg is already the heading above, so repeating it on every card would
  // be noise - except when the booking leaves it. A flight out of Hanoi is
  // filed under Hanoi, and has to say where it lands.
  const crossing = placement.stretches.length > 1;
  const address = addressOf(booking);
  const where = crossing
    ? placement.stretches.map(legLabel).join(" ← ")
    : address;

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
            {where && (
              <span
                className="mt-1 flex items-center gap-1 text-[11.5px] text-sea-deep"
                aria-label={strings.bookings.whereAria}
              >
                <PinIcon className="h-3 w-3 shrink-0" strokeWidth={1.7} />
                <span className="truncate">{where}</span>
              </span>
            )}
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
