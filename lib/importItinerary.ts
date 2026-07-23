// Parses an itinerary spreadsheet (.xlsx/.xls/.csv/.txt) into day + activity
// rows the app can import. Reuses SheetJS. Flexible Hebrew/English headers; if
// the date cell is only filled on the first row of each day (a very common
// layout) the date carries forward to the following rows.

import * as XLSX from "xlsx";

export type ParsedItineraryRow = {
  date: string; // ISO YYYY-MM-DD
  title: string; // activity; "" means a day header row with no activity
  start_time: string | null; // HH:MM
  end_time: string | null;
  location_name: string | null;
  country_code: string | null;
  notes: string | null;
};

export type ParseResult = { rows: ParsedItineraryRow[]; skipped: number };

// header synonyms → field
const HEADERS: Record<keyof Omit<ParsedItineraryRow, never>, string[]> = {
  date: ["date", "day", "when", "תאריך", "יום"],
  title: ["activity", "activities", "title", "item", "event", "what", "plan",
    "description", "desc", "פעילות", "פעילויות", "מה", "מה עושים", "תיאור", "שם", "אירוע"],
  start_time: ["time", "start", "start time", "from", "hour", "שעה", "שעת התחלה", "התחלה", "משעה"],
  end_time: ["end", "end time", "to", "until", "finish", "שעת סיום", "סיום", "עד"],
  location_name: ["location", "place", "address", "area", "city", "where",
    "מיקום", "מקום", "כתובת", "אזור", "עיר"],
  country_code: ["country", "country code", "מדינה", "קוד מדינה"],
  notes: ["notes", "note", "remarks", "comment", "comments", "הערות", "הערה"],
};

function pad(v: string | number): string {
  return String(v).padStart(2, "0");
}

function excelDateToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO date from an Excel serial number or a text date (ISO or DD/MM/YYYY). */
export function parseDateCell(cell: unknown): string | null {
  if (typeof cell === "number") return excelDateToISO(cell);
  const s = String(cell ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  // Israeli DD/MM/YYYY (also . or - separators)
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** HH:MM from an Excel time fraction or a text time. */
export function parseTimeCell(cell: unknown): string | null {
  if (typeof cell === "number") {
    const frac = cell - Math.floor(cell);
    if (frac <= 0) return cell === 0 ? null : null;
    const mins = Math.round(frac * 24 * 60);
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const s = String(cell ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : null;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const all = Object.values(HEADERS).flat();
  return row.some((c) => all.includes(String(c ?? "").toLowerCase().trim()));
}

function str(cell: unknown): string {
  return String(cell ?? "").trim();
}

export async function parseItinerarySheet(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  // raw values kept (dates→serial numbers, times→fractions) so we can parse them
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], skipped: 0 };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (grid.length === 0) return { rows: [], skipped: 0 };

  // column mapping from a header row (fallback to a sensible default order)
  const col: Partial<Record<keyof ParsedItineraryRow, number>> = {};
  let start = 0;
  if (looksLikeHeaderRow(grid[0])) {
    start = 1;
    grid[0].forEach((cell, i) => {
      const c = str(cell).toLowerCase();
      for (const [field, words] of Object.entries(HEADERS)) {
        if (col[field as keyof ParsedItineraryRow] === undefined && words.includes(c)) {
          col[field as keyof ParsedItineraryRow] = i;
        }
      }
    });
  }
  if (col.date === undefined) col.date = 0;
  if (col.title === undefined) col.title = 1;
  if (col.start_time === undefined && start === 0) col.start_time = 2;
  if (col.location_name === undefined && start === 0) col.location_name = 3;

  const at = (row: unknown[], field: keyof ParsedItineraryRow): unknown => {
    const i = col[field];
    return i === undefined ? "" : row[i];
  };

  const rows: ParsedItineraryRow[] = [];
  let skipped = 0;
  let lastDate: string | null = null;

  for (const row of grid.slice(start)) {
    const parsedDate = parseDateCell(at(row, "date"));
    if (parsedDate) lastDate = parsedDate;
    const date = parsedDate ?? lastDate;

    const title = str(at(row, "title"));
    const location = str(at(row, "location_name"));
    const notes = str(at(row, "notes"));
    const cc = str(at(row, "country_code")).toUpperCase();

    // nothing usable on this row
    if (!title && !location && !notes && !parsedDate) continue;
    // an activity/detail row with no resolvable date can't be placed
    if (!date) {
      skipped++;
      continue;
    }

    rows.push({
      date,
      title,
      start_time: parseTimeCell(at(row, "start_time")),
      end_time: parseTimeCell(at(row, "end_time")),
      location_name: location || null,
      country_code: /^[A-Z]{2}$/.test(cc) ? cc : null,
      notes: notes || null,
    });
  }

  return { rows, skipped };
}
