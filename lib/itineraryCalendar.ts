// Pure calendar indexing for the itinerary month grid.
//
// Extracted out of CalendarView so the rules that decide what a date cell shows
// are testable on their own: which dates a multi-day leg covers, which label
// belongs to a covered date, and how many activities sit on it. Getting the leg
// span wrong silently mislabels weeks of the trip, which is exactly the kind of
// thing a unit test should catch rather than an eyeball.

import type { ItineraryDay, ItineraryItem } from "@/lib/types";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** A day imported as a LEG carries its range in notes ("1.11 - 22.11"); the
 *  whole span is shaded so a 3-week leg reads as one block, not a single date.
 *  Days without such a range cover just themselves. */
export function legEndISO(day: ItineraryDay): string | null {
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

/** What one date cell needs to render without opening the day. */
export type CalendarCell = {
  /** The day this date belongs to — its own, or the leg that covers it. */
  dayId: string;
  /** ISO date to open when tapped (the leg's start, for a covered date). */
  opensDate: string;
  /** True when this date is the day's own date rather than inside its span. */
  isStart: boolean;
  /** Short label of the plan: the location, falling back to the country code. */
  label: string | null;
  countryCode: string | null;
  /** Activities on the day. Only start dates carry them — items belong to the
   *  day row, not to each date its leg spans. */
  itemCount: number;
};

export type CalendarIndex = {
  cells: Map<string, CalendarCell>;
  /** Months to render, earliest first. */
  months: { y: number; m: number }[];
};

export type CalendarRange = {
  /** Months to show before the trip's first month, so a day can be added
   *  ahead of the current span. */
  monthsBefore?: number;
  /** Months to show after the trip's last month, same reason. */
  monthsAfter?: number;
  /** ISO date the grid centres on when the itinerary is empty — without it
   *  there is no span to derive months from, and the calendar has nothing to
   *  render at all. */
  anchorDate?: string;
};

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

/** Guard against a nonsense range (a typo'd year) expanding into thousands of
 *  cells and freezing the grid. */
const MAX_LEG_DAYS = 400;

export function buildCalendarIndex(
  days: ItineraryDay[],
  items: ItineraryItem[],
  range: CalendarRange = {}
): CalendarIndex {
  const monthsBefore = Math.max(0, range.monthsBefore ?? 1);
  const monthsAfter = Math.max(0, range.monthsAfter ?? 1);
  const itemsByDayId = new Map<string, number>();
  for (const item of items) {
    itemsByDayId.set(item.day_id, (itemsByDayId.get(item.day_id) ?? 0) + 1);
  }

  const cells = new Map<string, CalendarCell>();
  let lastCoveredISO = "";

  // Sorted so an earlier leg claims a contested date; overlapping legs are a
  // data mistake, and picking deterministically beats picking by hash order.
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sorted) {
    const label = day.location_name?.trim() || null;
    const base: Omit<CalendarCell, "isStart"> = {
      dayId: day.id,
      opensDate: day.date,
      label: label ?? day.country_code ?? null,
      countryCode: day.country_code,
      itemCount: itemsByDayId.get(day.id) ?? 0,
    };
    // The day's own date always wins, even if an earlier leg covers it.
    cells.set(day.date, { ...base, isStart: true });
    if (day.date > lastCoveredISO) lastCoveredISO = day.date;

    const end = legEndISO(day);
    if (!end || end <= day.date) continue;

    const cursor = new Date(`${day.date}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    let guard = 0;
    while (cursor < endDate && guard++ < MAX_LEG_DAYS) {
      cursor.setDate(cursor.getDate() + 1);
      const key = iso(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (!cells.has(key)) {
        // Covered dates carry the leg's label but not its activity count —
        // showing "5 activities" on all 22 days of a leg would be a lie.
        cells.set(key, { ...base, isStart: false, itemCount: 0 });
      }
      if (key > lastCoveredISO) lastCoveredISO = key;
    }
  }

  // With no days there is no span, so the grid hangs off the anchor instead —
  // otherwise an empty itinerary renders no months and offers nowhere to start.
  const firstISO = sorted.length > 0 ? sorted[0].date : range.anchorDate;
  const lastISO = sorted.length > 0 ? lastCoveredISO : range.anchorDate;

  const months: { y: number; m: number }[] = [];
  if (firstISO && lastISO) {
    const first = new Date(`${firstISO}T00:00:00`);
    const last = new Date(`${lastISO}T00:00:00`);
    const start = addMonths(first.getFullYear(), first.getMonth(), -monthsBefore);
    const end = addMonths(last.getFullYear(), last.getMonth(), monthsAfter);
    let { y, m } = start;
    // Bounded so a corrupt date can't spin this into thousands of months.
    let guard = 0;
    while ((y < end.y || (y === end.y && m <= end.m)) && guard++ < 600) {
      months.push({ y, m });
      ({ y, m } = addMonths(y, m, 1));
    }
  }

  return { cells, months };
}
