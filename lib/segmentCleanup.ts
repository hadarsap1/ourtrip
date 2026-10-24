// F6 data cleanup: proposes Hebrew display names for itinerary segments and
// flags possible duplicates. Pure functions only - it never writes. The
// script in scripts/segment-cleanup.mts feeds it rows and prints a report;
// any rename is applied by a human after reading that report.
//
// A "segment" here is a run of consecutive days sharing one location label and
// one country code, the same rule lib/data/segments.ts uses for stretches.

export type DayRow = {
  date: string; // YYYY-MM-DD
  location_name: string | null;
  country_code: string | null;
};

export type Segment = {
  index: number;
  label: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  nights: number;
};

export type FlagKind =
  | "latin-label" // shown to the family in Latin script
  | "admin-prefix" // e.g. "Amphoe Mueang ..." (a Thai district name, not a town)
  | "adjacent-same-place" // next to a segment that is the same place spelled differently
  | "repeat-visit" // same place again later in the trip; usually intentional
  | "stop-inside-country" // a city stop that splits a country-wide segment
  | "no-proposal"; // Latin label with no known Hebrew name

export type Proposal = Segment & {
  proposedLabel: string;
  changed: boolean;
  flags: { kind: FlagKind; note: string }[];
};

// Known Latin → Hebrew place names. Only a suggestion source: anything not in
// here is flagged "no-proposal" for the family to name, never guessed.
const HEBREW_NAMES: Record<string, string> = {
  tokyo: "טוקיו",
  kyoto: "קיוטו",
  osaka: "אוסקה",
  hakone: "האקונה",
  sapporo: "סאפורו",
  "chiang mai": "צ'יאנג מאי",
  "chiang rai": "צ'יאנג ראי",
  bangkok: "בנגקוק",
  "koh samui": "קו סמוי",
  phuket: "פוקט",
  hanoi: "האנוי",
  "hoi an": "הוי אן",
  "da nang": "דה נאנג",
  "ho chi minh city": "הו צ'י מין",
  "siem reap": "סיאם ריפ",
  "phnom penh": "פנום פן",
  "luang prabang": "לואנג פרבנג",
  vientiane: "ויינטיאן",
  manila: "מנילה",
  "el nido": "אל נידו",
  tbilisi: "טביליסי",
  batumi: "בטומי",
};

const ADMIN_PREFIXES = [/^amphoe\s+mueang\s+/i, /^mueang\s+/i, /^amphoe\s+/i, /^thanh pho\s+/i, /^khan\s+/i];

const LATIN = /[A-Za-z]/;
const HEBREW = /[֐-׿]/;

export function splitSegments(days: DayRow[]): Segment[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: Segment[] = [];
  for (const d of sorted) {
    const label = (d.location_name ?? "").trim();
    const cc = (d.country_code ?? "").trim().toUpperCase();
    const last = out[out.length - 1];
    if (last && last.label === label && last.countryCode === cc) {
      last.endDate = d.date;
      last.nights++;
    } else {
      out.push({ index: out.length + 1, label, countryCode: cc, startDate: d.date, endDate: d.date, nights: 1 });
    }
  }
  return out;
}

/** Hebrew label for a segment, or null when the label is Latin and unknown. */
export function proposeHebrewName(label: string): { name: string | null; hadAdminPrefix: boolean } {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed || HEBREW.test(trimmed) || !LATIN.test(trimmed)) {
    return { name: trimmed, hadAdminPrefix: false };
  }
  let core = trimmed;
  let hadAdminPrefix = false;
  for (const p of ADMIN_PREFIXES) {
    if (p.test(core)) {
      core = core.replace(p, "");
      hadAdminPrefix = true;
      break;
    }
  }
  return { name: HEBREW_NAMES[core.toLowerCase()] ?? null, hadAdminPrefix };
}

/** Comparison key: one place spelled in Hebrew or Latin maps to the same key. */
function placeKey(label: string): string {
  const { name } = proposeHebrewName(label);
  return (name ?? label).trim().toLowerCase();
}

export function buildProposals(days: DayRow[]): Proposal[] {
  const segments = splitSegments(days);
  const keys = segments.map((s) => `${s.countryCode}|${placeKey(s.label)}`);

  return segments.map((s, i) => {
    const flags: Proposal["flags"] = [];
    const { name, hadAdminPrefix } = proposeHebrewName(s.label);

    if (LATIN.test(s.label) && !HEBREW.test(s.label)) {
      flags.push({ kind: "latin-label", note: "Shown in Latin script" });
      if (name === null) flags.push({ kind: "no-proposal", note: "No known Hebrew name - please name it" });
    }
    if (hadAdminPrefix) flags.push({ kind: "admin-prefix", note: "Administrative district name, not the town" });

    const prev = i > 0 ? keys[i - 1] : null;
    const next = i < keys.length - 1 ? keys[i + 1] : null;
    if (prev === keys[i] || next === keys[i]) {
      const other = prev === keys[i] ? segments[i - 1] : segments[i + 1];
      flags.push({
        kind: "adjacent-same-place",
        note: `Same place as segment ${other.index} ("${other.label}") right next to it - possibly one stay split by spelling`,
      });
    }
    const repeats = keys
      .map((k, j) => (k === keys[i] && Math.abs(j - i) > 1 ? segments[j].index : null))
      .filter((x): x is number => x !== null);
    if (repeats.length) {
      flags.push({ kind: "repeat-visit", note: `Same place again in segment ${repeats.join(", ")} - likely a separate visit, keep both` });
    }
    if (
      i > 0 &&
      i < segments.length - 1 &&
      segments[i - 1].label === segments[i + 1].label &&
      segments[i - 1].countryCode === s.countryCode &&
      segments[i + 1].countryCode === s.countryCode &&
      segments[i - 1].label !== s.label
    ) {
      flags.push({
        kind: "stop-inside-country",
        note: `Splits "${segments[i - 1].label}" into two segments`,
      });
    }

    const proposedLabel = name ?? s.label;
    return { ...s, proposedLabel, changed: proposedLabel !== s.label, flags };
  });
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Markdown report. Rename SQL is printed for review, never executed. */
export function renderReport(proposals: Proposal[], generatedAt: string): string {
  const lines: string[] = [];
  lines.push("# Segment cleanup - dry run (F6)", "");
  lines.push(`Generated ${generatedAt}. Read-only: nothing was changed. Nothing is merged automatically.`, "");
  lines.push("| # | Dates | Nights | CC | Current label | Proposed label | Flags |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of proposals) {
    const flags = p.flags.map((f) => `**${f.kind}**: ${f.note}`).join("<br>") || "-";
    lines.push(
      `| ${p.index} | ${p.startDate} → ${p.endDate} | ${p.nights} | ${p.countryCode || "-"} | ${p.label || "(empty)"} | ${p.changed ? p.proposedLabel : "(no change)"} | ${flags} |`
    );
  }
  const renames = proposals.filter((p) => p.changed);
  lines.push("", "## Proposed renames (not applied)", "");
  if (!renames.length) {
    lines.push("None.");
  } else {
    lines.push("Approve each line before running it. Each statement only touches that segment's date range.", "", "```sql");
    for (const p of renames) {
      lines.push(
        `-- segment ${p.index}: "${p.label}" → "${p.proposedLabel}"` +
          (p.flags.some((f) => f.kind === "adjacent-same-place") ? "  -- JOINS it with the segment next to it, see below" : ""),
        `update itinerary_days set location_name = ${sqlString(p.proposedLabel)}`,
        `  where date between '${p.startDate}' and '${p.endDate}' and location_name = ${sqlString(p.label)};`
      );
    }
    lines.push("```");
  }
  const adjacent = proposals.filter((p) => p.flags.some((f) => f.kind === "adjacent-same-place"));
  if (adjacent.length) {
    lines.push(
      "",
      "## Needs a decision",
      "",
      "Adjacent segments that look like the same place. Renaming them to the same label joins them into one segment in the app. Only do that if it really is one stay."
    );
  }
  return lines.join("\n") + "\n";
}
