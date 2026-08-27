// Parses an itinerary spreadsheet into day + activity rows the app can import.
// Reuses SheetJS. Built for real family planning sheets, which tend to be:
//   • multi-sheet — one sheet per leg/country (the sheet NAME is the place);
//   • date columns that hold a RANGE ("1.11 - 22.11") often with no year;
//   • a category column (לינה / אטרקציה / תחבורה …) + a place + a description
//     + a link, rather than one activity per row with a clock time.
// It still handles a simple single-sheet "date | activity | time" table too.

// SheetJS is ~300 KB and only needed once someone actually picks a file.
// A static import put it in the /itinerary, /checklists and /map bundles,
// which every page load paid for.
import { loadSheetJS } from "@/lib/importFile";

export type ParsedItineraryRow = {
  date: string; // ISO YYYY-MM-DD (leg start when the cell is a range)
  title: string; // activity ("" = a day-header row with no activity)
  start_time: string | null; // HH:MM
  end_time: string | null;
  location_name: string | null; // the item's own place, when distinct
  country_code: string | null; // the day's country (ISO), inferred if possible
  notes: string | null; // description (+ link) for the item
  day_location: string | null; // leg name for the day (usually the sheet name)
  day_note: string | null; // e.g. the original date-range text
  day_end: string | null; // ISO end of the leg's range (for hotel check-out)
  is_lodging: boolean; // לינה/מלון row → becomes a hotel booking, not an item
  link: string | null; // raw link (kept separately for bookings)
};

export type ParseResult = { rows: ParsedItineraryRow[]; skipped: number };

const HEADERS: Record<string, string[]> = {
  date: ["date", "dates", "day", "when", "תאריך", "תאריכים", "תאריכים מתוכננים", "יום"],
  title: ["activity", "activities", "title", "item", "event", "what", "plan", "place",
    "פעילות", "פעילויות", "מה", "מה עושים", "שם", "אירוע", "פירוט", "שם המקום",
    "פירוט / שם המקום", "מקום ופירוט"],
  category: ["category", "type", "קטגוריה", "סוג"],
  start_time: ["time", "start", "start time", "from", "hour", "שעה", "שעת התחלה", "התחלה", "משעה"],
  end_time: ["end", "end time", "to", "until", "finish", "שעת סיום", "סיום", "עד"],
  location_name: ["location", "address", "area", "city", "where", "מיקום", "מקום", "כתובת", "אזור", "עיר"],
  country_code: ["country", "country code", "מדינה", "קוד מדינה"],
  notes: ["notes", "note", "remarks", "comment", "comments", "description", "desc",
    "הערות", "הערה", "תיאור", "תיאור והתאמה למשפחה", "הערות הדר וסיוון"],
  link: ["link", "url", "links", "קישור", "קישור רלוונטי"],
};

// Hebrew country name (substring) → ISO code, for per-country emergency pages.
const HE_COUNTRY: [string, string][] = [
  ["תאילנד", "TH"], ["לאוס", "LA"], ["וייטנאם", "VN"], ["ויאטנם", "VN"], ["קמבודיה", "KH"],
  ["פיליפינים", "PH"], ["יפן", "JP"], ["סין", "CN"], ["הודו", "IN"], ["נפאל", "NP"],
  ["סרי לנקה", "LK"], ["סינגפור", "SG"], ["מלזיה", "MY"], ["אינדונזיה", "ID"], ["באלי", "ID"],
  ["מיאנמר", "MM"], ["דרום קוריאה", "KR"], ["טייוואן", "TW"], ["הונג קונג", "HK"],
  ["אוסטרליה", "AU"], ["ניו זילנד", "NZ"], ["ישראל", "IL"], ["פורטוגל", "PT"], ["ספרד", "ES"],
  ["צרפת", "FR"], ["איטליה", "IT"], ["יוון", "GR"], ["גרמניה", "DE"], ["הולנד", "NL"],
  ["בריטניה", "GB"], ["אנגליה", "GB"], ["ארצות הברית", "US"], ["ארהב", "US"], ["קנדה", "CA"],
  ["מקסיקו", "MX"], ["ברזיל", "BR"], ["ארגנטינה", "AR"], ["צ׳ילה", "CL"], ["פרו", "PE"],
  ["מרוקו", "MA"], ["מצרים", "EG"], ["ירדן", "JO"], ["טורקיה", "TR"], ["גאורגיה", "GE"],
];

const CATEGORY_EMOJI: [string, string][] = [
  ["לינה", "🏨"], ["מלון", "🏨"], ["אטרקציה", "🎡"], ["תחבורה", "🚗"], ["טיסה", "✈️"],
  ["אוכל", "🍽️"], ["מסעדה", "🍽️"], ["טיפ", "💡"], ["קניות", "🛍️"],
];

function pad(v: string | number): string {
  return String(v).padStart(2, "0");
}

function excelDateToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO date from an Excel serial number or a text date (ISO or DD/MM/YYYY with
 *  a year). Returns null for a bare DD.MM (no year) — see startOfRange. */
export function parseDateCell(cell: unknown): string | null {
  if (typeof cell === "number") return excelDateToISO(cell);
  const s = String(cell ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /\d{4}/.test(s)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** HH:MM from an Excel time fraction or a text time. */
export function parseTimeCell(cell: unknown): string | null {
  if (typeof cell === "number") {
    const frac = cell - Math.floor(cell);
    if (frac <= 0) return null;
    const mins = Math.round(frac * 24 * 60);
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const s = String(cell ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : null;
}

// Start of a date range like "1.11 - 22.11". Returns a full ISO date when the
// year is present, or {day, month} when it must be inferred, plus the raw text.
type RangeStart =
  | { iso: string; needYear: null; text: string }
  | { iso: null; needYear: { d: number; m: number }; text: string }
  | { iso: null; needYear: null; text: string };

function startOfRange(cell: unknown): RangeStart {
  if (typeof cell === "number") {
    const iso = excelDateToISO(cell);
    return iso ? { iso, needYear: null, text: iso } : { iso: null, needYear: null, text: "" };
  }
  const text = String(cell ?? "").trim();
  const first = text.split(/\s*(?:[-–—]|עד)\s*/)[0]?.trim() ?? "";
  const full = parseDateCell(first);
  if (full) return { iso: full, needYear: null, text };
  const m = first.match(/^(\d{1,2})[.\/-](\d{1,2})$/);
  if (m) return { iso: null, needYear: { d: +m[1], m: +m[2] }, text };
  return { iso: null, needYear: null, text };
}

function str(cell: unknown): string {
  return String(cell ?? "").trim();
}

function inferCountry(legName: string | null): string | null {
  if (!legName) return null;
  for (const [he, cc] of HE_COUNTRY) if (legName.includes(he)) return cc;
  return null;
}

function categoryEmoji(category: string): string {
  for (const [he, emoji] of CATEGORY_EMOJI) if (category.includes(he)) return emoji;
  return "";
}

function isLodging(category: string): boolean {
  return category.includes("לינה") || category.includes("מלון") || /hotel|lodg|stay/i.test(category);
}

/** End of a date range ("1.11 - 22.11" → 22.11), using the leg's start year so
 *  an end that rolls past new-year lands in the next year. */
function endOfRange(text: string, startYear: number | null, startMonth: number | null): string | null {
  const parts = text.split(/\s*(?:[-–—]|עד)\s*/);
  if (parts.length < 2) return null;
  const end = parts[1].trim();
  const full = parseDateCell(end);
  if (full) return full;
  const m = end.match(/^(\d{1,2})[.\/-](\d{1,2})$/);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = startYear ?? new Date().getFullYear();
    const year = startMonth !== null && mo < startMonth ? y + 1 : y;
    return `${year}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

function mapColumns(headerRow: unknown[]): Record<string, number> {
  const col: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const c = str(cell).toLowerCase();
    for (const [field, words] of Object.entries(HEADERS)) {
      if (col[field] === undefined && words.some((w) => c === w || c.includes(w))) {
        col[field] = i;
      }
    }
  });
  return col;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  return Object.keys(mapColumns(row)).length >= 2;
}

/** Parses every sheet of the workbook. Year is inferred across sheets in order:
 *  a leg whose start month is earlier than the previous leg's rolls into the
 *  next year (e.g. Nov→Dec 2026 then Jan 2027). */
export async function parseItinerarySheet(file: File): Promise<ParseResult> {
  const [XLSX, buf] = await Promise.all([loadSheetJS(), file.arrayBuffer()]);
  const wb = XLSX.read(buf, { type: "array" });

  const rows: ParsedItineraryRow[] = [];
  let skipped = 0;

  // year-inference state, threaded across all sheets/rows in order
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  let year: number | null = null;
  let prevMonth: number | null = null;
  let lastIso: string | null = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (grid.length === 0) continue;

    let start = 0;
    let col: Record<string, number> = {};
    if (looksLikeHeaderRow(grid[0])) {
      start = 1;
      col = mapColumns(grid[0]);
    }
    if (col.date === undefined) col.date = 0;
    if (col.title === undefined) col.title = 1;

    const legName = /^sheet\d*$/i.test(sheetName) || /^גיליון/.test(sheetName)
      ? null
      : sheetName.trim();
    const legCountry = inferCountry(legName);

    const at = (row: unknown[], field: string): unknown => {
      const i = col[field];
      return i === undefined ? "" : row[i];
    };

    for (const row of grid.slice(start)) {
      const range = startOfRange(at(row, "date"));
      let iso = range.iso;
      if (!iso && range.needYear) {
        const { d, m } = range.needYear;
        if (year === null) year = m >= curM ? curY : curY + 1;
        else if (prevMonth !== null && m < prevMonth) year += 1;
        prevMonth = m;
        iso = `${year}-${pad(m)}-${pad(d)}`;
      } else if (iso) {
        year = Number(iso.slice(0, 4));
        prevMonth = Number(iso.slice(5, 7));
      }
      if (iso) lastIso = iso;
      const date = iso ?? lastIso;

      const category = str(at(row, "category"));
      const place = str(at(row, "title"));
      const desc = str(at(row, "notes"));
      const link = str(at(row, "link"));
      const explicitLoc = str(at(row, "location_name"));
      const ccCell = str(at(row, "country_code")).toUpperCase();

      if (!place && !desc && !explicitLoc && !range.iso && !range.needYear) continue;
      if (!date) {
        skipped++;
        continue;
      }

      const emoji = categoryEmoji(category);
      const title = place ? (emoji ? `${emoji} ${place}` : place) : "";
      const noteParts = [desc, link].filter(Boolean);
      const dayEnd = endOfRange(range.text, year, prevMonth);

      rows.push({
        date,
        title,
        start_time: parseTimeCell(at(row, "start_time")),
        end_time: parseTimeCell(at(row, "end_time")),
        location_name: explicitLoc || null,
        country_code: (/^[A-Z]{2}$/.test(ccCell) ? ccCell : null) ?? legCountry,
        notes: noteParts.length ? noteParts.join("\n") : null,
        day_location: legName,
        day_note: range.text || null,
        day_end: dayEnd,
        is_lodging: isLodging(category),
        link: link || null,
      });
    }
  }

  return { rows, skipped };
}
