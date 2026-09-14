// Reading a Gmail message into plain text, and turning the model's reply into
// booking candidates.
//
// Lives in _shared rather than inside gmail-bookings/index.ts so it can be
// exercised by the vitest suite: this is where the bugs actually are. A MIME
// tree is nested, a body is base64url with the padding stripped, an HTML-only
// confirmation has to survive tag removal with its dates intact, and a model
// reply has to be sanitised before any of it reaches the trip. None of that is
// testable through a Deno.serve handler, and all of it is worth a test.

export type MailHeader = { name?: string; value?: string };

export type MailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MailPart[];
};

export type MailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: MailPart & { headers?: MailHeader[] };
};

export const BOOKING_TYPES = [
  "flight",
  "hotel",
  "train",
  "attraction",
  "car_rental",
  "other",
];

export function headerOf(message: MailMessage, name: string): string {
  const found = message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? "";
}

/** Gmail encodes bodies base64url with the padding stripped. atob wants
 *  standard base64 and full padding, and a body that fails to decode must not
 *  take the whole batch down with it. */
export function decodeBody(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    // Confirmations arrive in Hebrew, Japanese and Vietnamese - decoding as
    // anything but UTF-8 would mangle exactly the hotel names that matter.
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** Enough HTML removal to leave a confirmation's facts readable. Block-level
 *  closings become newlines first: without that a table of "check-in | 31 Oct"
 *  collapses into one line and the label stops being attached to its value. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Walks the MIME tree for readable text. text/plain wins when present - it is
 *  the same facts without a table layout wrapped around them. */
export function bodyText(part: MailPart | undefined): string {
  if (!part) return "";
  const plain: string[] = [];
  const html: string[] = [];

  const walk = (node: MailPart, depth: number) => {
    // multipart/related nests inside multipart/alternative inside
    // multipart/mixed routinely; the bound is only a guard against a cycle.
    if (depth > 12) return;
    const mime = node.mimeType ?? "";
    const data = node.body?.data;
    if (data) {
      if (mime.startsWith("text/plain")) plain.push(decodeBody(data));
      else if (mime.startsWith("text/html")) html.push(decodeBody(data));
    }
    for (const child of node.parts ?? []) walk(child, depth + 1);
  };
  walk(part, 0);

  const joined = plain.length > 0 ? plain.join("\n") : stripHtml(html.join("\n"));
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

export type RawCandidate = {
  message_id?: string;
  is_booking?: boolean;
  type?: string;
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  confirmation_code?: string | null;
  cost?: number | null;
  currency?: string | null;
  provider?: string | null;
  notes?: string | null;
};

export type Candidate = {
  message_id: string;
  type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  confirmation_code: string | null;
  cost: number | null;
  currency: string | null;
  provider: string | null;
  notes: string | null;
  subject: string;
  from: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns the model's reply into candidates, dropping anything that cannot be
 * trusted.
 *
 * The email bodies behind this are untrusted text from anyone who can send the
 * owner mail, so the reply gets treated as untrusted too:
 *
 * - an entry may only name a message id that was actually supplied, so a
 *   hostile email cannot attach its own fields to another message's headers;
 * - a type outside the enum becomes "other" rather than a value the database
 *   would reject;
 * - a date that is not a plain ISO date is dropped, and an end before the start
 *   is dropped rather than carried into the plan as a contradiction;
 * - a cost must be a finite positive number, and a currency must look like an
 *   ISO code, or both go;
 * - every free-text field is length-capped.
 */
export function toCandidates(
  emitted: RawCandidate[],
  sources: Map<string, { subject: string; from: string }>
): Candidate[] {
  return emitted
    .filter(
      (r) => r.is_booking === true && r.message_id && sources.has(r.message_id)
    )
    .map((r) => {
      const source = sources.get(r.message_id!)!;
      const start = r.start_date && ISO_DATE.test(r.start_date) ? r.start_date : null;
      let end = r.end_date && ISO_DATE.test(r.end_date) ? r.end_date : null;
      if (end && start && end < start) end = null;
      // An end date with no start cannot be placed on the plan and would make
      // the booking look dated when it is not.
      if (end && !start) end = null;

      const cost =
        typeof r.cost === "number" && Number.isFinite(r.cost) && r.cost > 0
          ? Math.round(r.cost * 100) / 100
          : null;

      return {
        message_id: r.message_id!,
        type: BOOKING_TYPES.includes(r.type ?? "") ? r.type! : "other",
        // Falling back to the subject keeps a real booking from arriving with a
        // blank name, which the form would then reject.
        title: (r.title ?? "").trim().slice(0, 120) || source.subject.slice(0, 120),
        start_date: start,
        end_date: end,
        confirmation_code: (r.confirmation_code ?? "").trim().slice(0, 60) || null,
        cost,
        // A currency with no amount renders as a bare symbol on the card.
        currency:
          cost != null &&
          typeof r.currency === "string" &&
          /^[A-Za-z]{3}$/.test(r.currency)
            ? r.currency.toUpperCase()
            : null,
        provider: (r.provider ?? "").trim().slice(0, 60) || null,
        notes: (r.notes ?? "").trim().slice(0, 300) || null,
        subject: source.subject.slice(0, 200),
        from: source.from.slice(0, 200),
      };
    });
}
