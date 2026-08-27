// Shared spreadsheet/text file parsing for the import features (checklist
// items, map routes). SheetJS is used because browsers can't parse .xlsx
// natively; .csv/.txt are handled the same way so one code path covers all.

// SheetJS is ~300 KB and only needed once someone actually picks a file.
// A static import put it in the /itinerary, /checklists and /map bundles,
// which every page load paid for.
type SheetJS = typeof import("xlsx");

let sheetJS: Promise<SheetJS> | null = null;

/** Loads SheetJS on demand, once per session. */
export function loadSheetJS(): Promise<SheetJS> {
  sheetJS ??= import("xlsx");
  return sheetJS;
}

export type SheetRows = string[][];

/** Reads the first sheet of an .xlsx/.xls/.csv, or lines of a .txt, into a
 *  matrix of trimmed strings (blank rows dropped). */
export async function parseSheet(file: File): Promise<SheetRows> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt")) {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .map((line) => [line.trim()])
      .filter((row) => row[0] !== "");
  }

  const [XLSX, buf] = await Promise.all([loadSheetJS(), file.arrayBuffer()]);
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  return rows
    .map((r) => {
      const cells = r.map((c) => (c == null ? "" : String(c).trim()));
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells;
    })
    .filter((r) => r.length > 0);
}

const HEADER_WORDS = [
  "item", "task", "label", "name", "פריט", "משימה", "שם",
  "lat", "latitude", "lng", "lon", "long", "longitude", "קו רוחב", "קו אורך",
];

function looksLikeHeader(row: string[]): boolean {
  return row.some((c) => HEADER_WORDS.includes(c.toLowerCase().trim()));
}

/** First-column values as a flat list (for checklist items). Drops an obvious
 *  header row and any blanks. */
export function toLabels(rows: SheetRows): string[] {
  if (rows.length === 0) return [];
  const start = looksLikeHeader(rows[0]) ? 1 : 0;
  return rows
    .slice(start)
    .map((r) => (r[0] ?? "").trim())
    .filter((v) => v !== "");
}

export type RoutePoint = { lat: number; lng: number };

/** Parses [lat,lng] points from a sheet. Honors a header row naming the
 *  lat/lng columns (any order); otherwise assumes the last two numeric-looking
 *  columns are lat then lng. Rows without a valid coordinate pair are skipped. */
export function toRoutePoints(rows: SheetRows): RoutePoint[] {
  if (rows.length === 0) return [];

  let latCol = -1;
  let lngCol = -1;
  let start = 0;

  if (looksLikeHeader(rows[0])) {
    start = 1;
    rows[0].forEach((cell, i) => {
      const c = cell.toLowerCase().trim();
      if (["lat", "latitude", "קו רוחב"].includes(c)) latCol = i;
      if (["lng", "lon", "long", "longitude", "קו אורך"].includes(c)) lngCol = i;
    });
  }

  const points: RoutePoint[] = [];
  for (const row of rows.slice(start)) {
    let lat: number;
    let lng: number;
    if (latCol >= 0 && lngCol >= 0) {
      lat = parseFloat(row[latCol]);
      lng = parseFloat(row[lngCol]);
    } else {
      // no header mapping: take the two right-most parseable numbers as lat,lng
      const nums = row
        .map((c) => parseFloat(c))
        .filter((n) => Number.isFinite(n));
      if (nums.length < 2) continue;
      lat = nums[nums.length - 2];
      lng = nums[nums.length - 1];
    }
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      points.push({ lat, lng });
    }
  }
  return points;
}
