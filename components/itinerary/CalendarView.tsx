"use client";

import { useMemo, useState } from "react";
import { buildCalendarIndex, iso } from "@/lib/itineraryCalendar";
import { strings } from "@/lib/strings";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

const monthLabel = (y: number, m: number) => {
  try {
    return new Intl.DateTimeFormat("he", { month: "long", year: "numeric" }).format(
      new Date(y, m, 1)
    );
  } catch {
    return `${m + 1}/${y}`;
  }
};

/** Month-grid overview of the trip. Each date shows what is planned on it -
 *  where you are, and how many activities - so the plan is readable without
 *  opening anything. Tapping still opens the day (existing → scroll to it,
 *  empty → offer to add it). */
export function CalendarView({
  days,
  items,
  onSelectDate,
}: {
  days: ItineraryDay[];
  items: ItineraryItem[];
  onSelectDate: (dateISO: string) => void;
}) {
  // Months shown beyond the trip's own span. Tapping a date in one of them
  // offers to add that day, which is how the trip gets extended from here -
  // before this, the grid stopped dead at the first and last planned day.
  const [monthsBefore, setMonthsBefore] = useState(1);
  const [monthsAfter, setMonthsAfter] = useState(1);

  const { cells, months, today } = useMemo(() => {
    const now = new Date();
    const todayISO = iso(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      // An empty itinerary has no span to hang months off, so it centres on
      // today and you can start adding from an ordinary-looking calendar.
      ...buildCalendarIndex(days, items, {
        monthsBefore,
        monthsAfter,
        anchorDate: todayISO,
      }),
      today: todayISO,
    };
  }, [days, items, monthsBefore, monthsAfter]);

  return (
    <div className="space-y-6 pb-8">
      {days.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-4 text-center text-sm text-ink-soft">
          {strings.itinerary.calendarEmpty}
        </p>
      )}

      <button
        type="button"
        onClick={() => setMonthsBefore((n) => n + 6)}
        className="w-full rounded-xl border border-line bg-white py-2 text-xs font-medium text-ink-soft"
      >
        {strings.itinerary.calendarEarlier}
      </button>

      {months.map(({ y, m }) => {
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = new Date(y, m, 1).getDay(); // 0=Sun
        const grid: (number | null)[] = [
          ...Array(lead).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        return (
          <section key={`${y}-${m}`}>
            <h2 className="mb-2 text-center text-sm font-bold text-ink">
              {monthLabel(y, m)}
            </h2>
            <div className="grid grid-cols-7 gap-1 text-center">
              {strings.itinerary.calendarWeekdays.map((w) => (
                <div key={w} className="text-[11px] font-medium text-ink-soft">
                  {w}
                </div>
              ))}
              {grid.map((d, i) => {
                if (d === null) return <div key={`b${i}`} />;
                const date = iso(y, m, d);
                const cell = cells.get(date);
                const isToday = date === today;

                return (
                  <button
                    key={date}
                    type="button"
                    // any day inside a leg opens that leg
                    onClick={() => onSelectDate(cell?.opensDate ?? date)}
                    // Taller than square: the extra room is what lets the plan
                    // show at all. Square cells only ever fit a number.
                    className={`relative flex min-h-[3.4rem] flex-col items-center justify-start gap-0.5 overflow-hidden rounded-lg px-0.5 pt-1 pb-1 text-sm transition-colors ${
                      cell?.isStart
                        ? "bg-sea-tint font-bold text-sea-deep"
                        : cell
                          ? "bg-sea-tint/40 text-sea-deep"
                          : "text-ink-soft hover:bg-paper-deep"
                    } ${isToday ? "ring-2 ring-sea" : ""}`}
                  >
                    <span className="leading-none">{d}</span>

                    {/* Where you are that day. Repeated across a leg on purpose:
                        a label that appears only on the leg's first date leaves
                        the rest of the block unexplained. */}
                    {cell?.label && (
                      <span
                        className={`w-full truncate text-[8px] leading-tight ${
                          cell.isStart
                            ? "font-semibold text-sea-deep"
                            : "font-normal text-sea-deep/70"
                        }`}
                        title={cell.label}
                      >
                        {cell.label}
                      </span>
                    )}

                    {/* Activities, as dots up to three so the density reads at a
                        glance; the exact number takes over beyond that. */}
                    {cell?.isStart && cell.itemCount > 0 && (
                      <span className="mt-auto flex items-center justify-center gap-0.5 leading-none">
                        {cell.itemCount <= 3 ? (
                          Array.from({ length: cell.itemCount }, (_, k) => (
                            <span
                              key={k}
                              className="h-1 w-1 rounded-full bg-sea"
                              aria-hidden="true"
                            />
                          ))
                        ) : (
                          <span className="text-[9px] font-semibold text-sea">
                            {cell.itemCount}
                          </span>
                        )}
                        <span className="sr-only">
                          {strings.itinerary.calendarActivityCount.replace(
                            "{n}",
                            String(cell.itemCount)
                          )}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setMonthsAfter((n) => n + 6)}
        className="w-full rounded-xl border border-line bg-white py-2 text-xs font-medium text-ink-soft"
      >
        {strings.itinerary.calendarLater}
      </button>
    </div>
  );
}
