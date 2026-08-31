"use client";

import { strings } from "@/lib/strings";
import { todayISO } from "@/lib/format";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

/**
 * A week of the trip at a glance, above the day list. Each day shows its
 * weekday letter, its date, and a dot saying whether anything is planned — so
 * you can see an empty day without scrolling to it.
 *
 * Tapping a day scrolls its group into view. The caller sets `scrollTop` from
 * the group's `offsetTop` rather than calling `scrollIntoView`, which would
 * also scroll the page behind it.
 */
export function DayStrip({
  days,
  items,
  onSelect,
  selectedId,
}: {
  days: ItineraryDay[];
  items: ItineraryItem[];
  onSelect: (day: ItineraryDay) => void;
  selectedId?: string | null;
}) {
  if (days.length === 0) return null;

  const today = todayISO();
  // Centre the window on today when the trip is under way, otherwise start it
  // at the first day — a strip showing seven days that have already happened is
  // no use mid-trip.
  const todayIndex = days.findIndex((d) => d.date >= today);
  const anchor = todayIndex < 0 ? days.length - 7 : todayIndex - 3;
  const start = Math.max(0, Math.min(anchor, days.length - 7));
  const window = days.slice(start, start + 7);

  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.status === "cancelled") continue;
    counts.set(item.day_id, (counts.get(item.day_id) ?? 0) + 1);
  }

  return (
    <ul
      aria-label={strings.itinerary.dayStripAria}
      className="flex items-start justify-between gap-1 border-b border-line px-3.5 pb-3 pt-3"
    >
      {window.map((day) => {
        const isToday = day.date === today;
        const active = selectedId ? day.id === selectedId : isToday;
        const count = counts.get(day.id) ?? 0;
        const [, , dayNum] = day.date.split("-");
        return (
          <li key={day.id}>
            <button
              type="button"
              onClick={() => onSelect(day)}
              aria-current={active ? "date" : undefined}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-[10.5px] font-medium text-ink-soft">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString("he-IL", {
                  weekday: "narrow",
                })}
              </span>
              <span
                className={`grid h-[31px] w-[31px] place-items-center rounded-full text-[13px] tabular-nums ${
                  active
                    ? "bg-sea-deep font-extrabold text-white"
                    : "font-semibold text-ink"
                }`}
                dir="ltr"
              >
                {dayNum}
              </span>
              <span
                aria-hidden="true"
                className={`h-1 w-1 rounded-full ${
                  isToday ? "bg-sun" : count > 0 ? "bg-sea" : "bg-line"
                }`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
