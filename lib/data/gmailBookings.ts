// Client half of the Gmail booking import. The Edge Function does the reading
// and the extraction; this module gets the Google token, walks the messages in
// batches so the owner sees progress, and works out which candidates are things
// the trip does not already have.

import { getSupabase } from "@/lib/supabase";
import { googleClientId, requestGoogleToken } from "@/lib/googleAuth";
import type { Booking, BookingType } from "@/lib/types";

/** Read-only, and the narrowest scope Gmail offers for reading mail. */
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Must match MAX_EXTRACT_IDS in the Edge Function. Anything above it is
 *  silently truncated there, which would drop messages from a scan. */
const BATCH = 5;

export function isGmailImportConfigured(): boolean {
  return Boolean(googleClientId());
}

export type MailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string | null;
};

export type BookingCandidate = {
  message_id: string;
  type: BookingType;
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

/** A candidate paired with the booking it appears to already be. */
export type ReviewedCandidate = {
  candidate: BookingCandidate;
  duplicateOf: Booking | null;
};

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** Turns the function's stable error codes into something the caller can map to
 *  Hebrew, and keeps an unexpected shape from reading as success. */
async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await requireClient().functions.invoke("gmail-bookings", {
    body,
  });
  if (error) {
    // supabase-js gives a generic message on a non-2xx; the function's own code
    // is in the body, which the client can still read.
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail ?? error.message);
  }
  if (!data?.ok) throw new Error((data as { error?: string })?.error ?? "failed");
  return data as Record<string, unknown>;
}

/** Consent + search. Returns the token so the scan that follows does not open a
 *  second Google popup. */
export async function beginMailScan(opts: {
  after: string | null;
  before: string | null;
}): Promise<{ token: string; messages: MailMessage[] }> {
  const token = await requestGoogleToken(SCOPE);
  const data = await invoke({
    action: "list",
    googleToken: token,
    after: opts.after,
    before: opts.before,
  });
  return { token, messages: (data.messages as MailMessage[]) ?? [] };
}

/** Reads the listed messages in batches, reporting progress after each one.
 *  Batching is what keeps a single function invocation short - a mailbox with
 *  forty confirmations is five calls, not one that times out. */
export async function extractBookings(opts: {
  token: string;
  ids: string[];
  onProgress?: (done: number, total: number) => void;
}): Promise<BookingCandidate[]> {
  const { token, ids, onProgress } = opts;
  const found: BookingCandidate[] = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const data = await invoke({ action: "extract", googleToken: token, ids: slice });
    found.push(...((data.candidates as BookingCandidate[]) ?? []));
    onProgress?.(Math.min(i + BATCH, ids.length), ids.length);
  }
  return found;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Which candidates the trip already holds.
 *
 * A confirmation code is the strongest signal - providers do not reuse one - so
 * a match there is a duplicate whatever the rest says. Failing that, a booking
 * of the same type, same title and same start date is the same booking: the
 * same confirmation email often arrives twice (an original and a "your
 * reservation is confirmed" follow-up), and re-importing it would put the same
 * hotel on the plan twice.
 */
export function reviewCandidates(
  candidates: BookingCandidate[],
  existing: Booking[]
): ReviewedCandidate[] {
  const byCode = new Map<string, Booking>();
  const byShape = new Map<string, Booking>();
  for (const booking of existing) {
    if (booking.confirmation_code) {
      byCode.set(norm(booking.confirmation_code), booking);
    }
    byShape.set(
      `${booking.type}|${norm(booking.title)}|${booking.start_date ?? ""}`,
      booking
    );
  }

  return candidates.map((candidate) => {
    const code = candidate.confirmation_code
      ? byCode.get(norm(candidate.confirmation_code))
      : undefined;
    const shape = byShape.get(
      `${candidate.type}|${norm(candidate.title)}|${candidate.start_date ?? ""}`
    );
    return { candidate, duplicateOf: code ?? shape ?? null };
  });
}

/** The insert row for a candidate the owner ticked. `status` is always 'booked':
 *  an email confirming a reservation says it is booked, not that it is paid. */
export function candidateToInsert(candidate: BookingCandidate, tripId: string) {
  const provider = candidate.provider ? `הוזמן דרך ${candidate.provider}` : null;
  const notes = [candidate.notes, provider].filter(Boolean).join(" · ") || null;
  return {
    trip_id: tripId,
    type: candidate.type,
    title: candidate.title,
    start_date: candidate.start_date,
    end_date: candidate.end_date,
    confirmation_code: candidate.confirmation_code,
    cost: candidate.cost,
    currency: candidate.cost != null ? candidate.currency : null,
    status: "booked" as const,
    notes,
  };
}
