"use client";

import { Sheet } from "@/components/Sheet";
import { formatDate, formatWeekday } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay } from "@/lib/types";

// One tap on a day completes the flow (move item / add booking to day).
export function DayPickerSheet({
  open,
  title,
  days,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  days: ItineraryDay[];
  onClose: () => void;
  onPick: (day: ItineraryDay) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* no day to pick (e.g. moving an item when it's the only day) - say so
          instead of showing an empty sheet */}
      {days.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          {strings.itinerary.noDaysToPick}
        </p>
      )}
      <ul className="divide-y divide-line">
        {days.map((day) => (
          <li key={day.id}>
            <button
              type="button"
              onClick={() => onPick(day)}
              className="flex w-full items-baseline justify-between gap-2 py-3 text-start hover:bg-paper-deep"
            >
              <span className="font-medium text-ink">
                {formatWeekday(day.date)} {formatDate(day.date)}
              </span>
              {day.location_name && (
                <span className="truncate text-sm text-ink-soft">
                  {day.location_name}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
