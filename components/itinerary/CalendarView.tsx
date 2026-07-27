"use client";

import { useMemo } from "react";
import { strings } from "@/lib/strings";
import type { ItineraryDay, ItineraryItem } from "@/lib/types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** A day imported as a LEG carries its range in notes ("1.11 - 22.11"); the
 *  whole span is shaded so a 3-week leg reads as one block, not a single date.
 *  Days without such a range cover just themselves. */
function legEndISO(day: ItineraryDay): string | null {
  const text = day.notes ?? "";
  const m = text.match(
    /(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\s*(?:[-–—]|עד)\s*(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/
  );
  if (!m) return null;
  const startMonth = Number(day.date.slice(5, 7));
  const startYear = Number(day.date.slice(0, 4));
  const endDay = Number(m[4]);
  const endMonth = Number(m[5]);
  if (!endDay || !endMonth || endDay > 31 || endMonth > 12) return null;
  let endYear = m[6] ? Number(m[6].length === 2 ? `20${m[6]}` : m[6]) : startYear;
  // a range that wraps past new-year ends in the following year
  if (!m[6] && endMonth < startMonth) endYear = startYear + 1;
  return `${endYear}-${pad(endMonth)}-${pad(endDay)}`;
}

const monthLabel = (y: number, m: number) => {
  try {
    return new Intl.DateTimeFormat("he", { month: "long", year: "numeric" }).format(
      new Date(y, m, 1)
    );
  } catch {
    return `${m + 1}/${y}`;
  }
};

/** Month-grid overview of the trip. Days that exist are highlighted with their
 *  activity count; tapping any date calls onSelectDate (existing → open it,
 *  empty → offer to add that day). */
export function CalendarView({
  days,
  items,
  onSelectDate,
}: {
  days: ItineraryDay[];
  items: ItineraryItem[];
  onSelectDate: (dateISO: string) => void;
}) {
  const { months, dayByDate, covered, countByDate, today } = useMemo(() => {
    const dayByDate = new Map(days.map((d) => [d.date, d]));
    const countByDayId = new Map<string, number>();
    for (const it of items) {
      countByDayId.set(it.day_id, (countByDayId.get(it.day_id) ?? 0) + 1);
    }
    const countByDate = new Map<string, number>();
    for (const d of days) countByDate.set(d.date, countByDayId.get(d.id) ?? 0);

    // every date inside a leg's span → the leg's start date (so tapping any
    // day of the leg opens it)
    const covered = new Map<string, string>();
    let lastCoveredISO = "";
    for (const d of days) {
      covered.set(d.date, d.date);
      const end = legEndISO(d);
      if (!end || end <= d.date) continue;
      const cur = new Date(`${d.date}T00:00:00`);
      const endDate = new Date(`${end}T00:00:00`);
      // guard against a nonsense range blowing up the grid
      let guard = 0;
      while (cur < endDate && guard++ < 400) {
        cur.setDate(cur.getDate() + 1);
        const key = iso(cur.getFullYear(), cur.getMonth(), cur.getDate());
        if (!covered.has(key)) covered.set(key, d.date);
        if (key > lastCoveredISO) lastCoveredISO = key;
      }
    }

    const sorted = [...dayByDate.keys()].sort();
    const months: { y: number; m: number }[] = [];
    if (sorted.length > 0) {
      const lastISO =
        lastCoveredISO > sorted[sorted.length - 1]
          ? lastCoveredISO
          : sorted[sorted.length - 1];
      const first = new Date(`${sorted[0]}T00:00:00`);
      const last = new Date(`${lastISO}T00:00:00`);
      let y = first.getFullYear();
      let m = first.getMonth();
      const endY = last.getFullYear();
      const endM = last.getMonth();
      while (y < endY || (y === endY && m <= endM)) {
        months.push({ y, m });
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
      }
    }
    const now = new Date();
    const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
    return { months, dayByDate, covered, countByDate, today };
  }, [days, items]);

  if (days.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
        {strings.itinerary.calendarEmpty}
      </p>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {months.map(({ y, m }) => {
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = new Date(y, m, 1).getDay(); // 0=Sun
        const cells: (number | null)[] = [
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
              {cells.map((d, i) => {
                if (d === null) return <div key={`b${i}`} />;
                const date = iso(y, m, d);
                const isStart = dayByDate.has(date);
                const legStart = covered.get(date);
                const inLeg = legStart !== undefined;
                const count = countByDate.get(date) ?? 0;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    // any day inside a leg opens that leg
                    onClick={() => onSelectDate(legStart ?? date)}
                    className={`relative aspect-square rounded-lg text-sm transition-colors ${
                      isStart
                        ? "bg-sea-tint font-bold text-sea-deep"
                        : inLeg
                          ? "bg-sea-tint/40 text-sea-deep"
                          : "text-ink-soft hover:bg-paper-deep"
                    } ${isToday ? "ring-2 ring-sea" : ""}`}
                  >
                    {d}
                    {isStart && count > 0 && (
                      <span className="absolute inset-x-0 bottom-0.5 text-[9px] font-medium text-sea">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
