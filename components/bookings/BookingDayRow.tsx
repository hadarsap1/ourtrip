"use client";

import type { ComponentType } from "react";
import {
  AttractionIcon,
  BedIcon,
  CarIcon,
  type IconProps,
  PinIcon,
  PlaneIcon,
  TrainIcon,
} from "@/components/icons";
import type { BookingOnDate } from "@/lib/bookingCalendar";
import { formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { BookingType } from "@/lib/types";

export const BOOKING_TYPE_ICON: Record<BookingType, ComponentType<IconProps>> = {
  flight: PlaneIcon,
  hotel: BedIcon,
  train: TrainIcon,
  attraction: AttractionIcon,
  car_rental: CarIcon,
  other: PinIcon,
};

/**
 * Where this date sits inside the booking. A five-night stay repeated on five
 * days needs to say which night it is, or the same row on five cards reads as
 * five separate bookings.
 */
export function spanLabel(entry: BookingOnDate): string | null {
  const { booking, isStart, isEnd, isRange, nightIndex, nightTotal } = entry;
  const lodging = booking.type === "hotel";

  if (!isRange) return lodging ? strings.bookings.dayCheckIn : null;
  if (isStart) return lodging ? strings.bookings.dayCheckIn : null;
  // The date a stay's guest leaves is not a night slept, so the last covered
  // date is the last night - saying "check-out" on it would be a day early.
  if (lodging && isEnd) return strings.bookings.dayLastNight;

  const template = lodging ? strings.bookings.dayNightOf : strings.bookings.dayDayOf;
  return template
    .replace("{n}", String(nightIndex))
    .replace("{total}", String(nightTotal));
}

/**
 * One booking as it appears on one day of the plan.
 *
 * Deliberately quieter than an itinerary item: a booking is context for the day
 * ("you sleep here", "you fly at some point"), not a task on it. It is tinted
 * and borderless so a day with four activities and a hotel still reads as four
 * activities.
 */
export function BookingDayRow({
  entry,
  onClick,
}: {
  entry: BookingOnDate;
  onClick: () => void;
}) {
  const { booking } = entry;
  const Icon = BOOKING_TYPE_ICON[booking.type];
  const span = spanLabel(entry);
  // Cost belongs to the booking, not to each night of it - repeating ₪1,950 on
  // five days would read as ₪9,750.
  const showCost = entry.isStart && booking.cost != null;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${strings.bookings.openBooking}: ${booking.title}`}
        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-start hover:bg-sea-tint/60"
      >
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg bg-white text-sea-deep">
          <Icon className="h-[14px] w-[14px]" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-sea-deep">
            {booking.title}
          </span>
          <span className="block truncate text-[11px] text-sea-deep/70">
            {strings.bookings.types[booking.type]}
            {span && ` · ${span}`}
            {entry.isStart && booking.confirmation_code && (
              <>
                {" · "}
                <span dir="ltr">{booking.confirmation_code}</span>
              </>
            )}
          </span>
        </span>
        {showCost && (
          <span
            className="shrink-0 text-[11.5px] font-semibold text-sea-deep/80"
            dir="ltr"
          >
            {formatMoney(booking.cost!, booking.currency ?? "ILS")}
          </span>
        )}
      </button>
    </li>
  );
}
