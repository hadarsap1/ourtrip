"use client";

import { Sheet } from "@/components/Sheet";
import { formatDate, formatWeekday } from "@/lib/format";
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
      <ul className="divide-y divide-slate-100">
        {days.map((day) => (
          <li key={day.id}>
            <button
              type="button"
              onClick={() => onPick(day)}
              className="flex w-full items-baseline justify-between gap-2 py-3 text-start hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">
                {formatWeekday(day.date)} {formatDate(day.date)}
              </span>
              {day.location_name && (
                <span className="truncate text-sm text-slate-500">
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
