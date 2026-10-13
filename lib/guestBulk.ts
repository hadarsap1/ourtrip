// Bulk guest invites (DESIGN-sharing §3): a parent pastes a list - straight
// out of a class WhatsApp group, a spreadsheet column, or typed by hand - and
// gets one invite per person.
//
// One person per line. The email is found anywhere on the line; whatever is
// left (minus separators) is the name. A line with no name uses the part of
// the address before the @, which the parent can live with or fix later.

export type BulkGuest = { name: string; email: string };
export type BulkParse = { guests: BulkGuest[]; invalid: string[]; duplicates: number };

const EMAIL = /[^\s<>(),;:"']+@[^\s<>(),;:"']+\.[^\s<>(),;:"'.]+/;
// separators people put between a name and an address
const EDGE_JUNK = /^[\s,;:|\-–<>()"'\t]+|[\s,;:|\-–<>()"'\t]+$/g;

export function parseGuestList(text: string): BulkParse {
  const guests: BulkGuest[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(EMAIL);
    if (!match) {
      invalid.push(line);
      continue;
    }
    const email = match[0].toLowerCase().replace(/[.]+$/, "");
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    const rest = (line.slice(0, match.index) + " " + line.slice((match.index ?? 0) + match[0].length))
      .replace(/\s+/g, " ")
      .replace(EDGE_JUNK, "")
      .trim();
    guests.push({ name: rest || email.split("@")[0], email });
  }
  return { guests, invalid, duplicates };
}

/** Suggested labels; the field stays free text (a class has a name). */
export const LABEL_SUGGESTIONS = ["משפחה", "חברים", "כיתה"] as const;

export function normalizeLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? "").trim().slice(0, 40);
  return trimmed || null;
}
