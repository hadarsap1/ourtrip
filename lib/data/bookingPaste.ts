// Paste-to-import, client side (Phase 2.1). Calls the booking-paste Edge
// Function and turns a reviewed result into a `bookings` row. The extra fields
// (times, terminal, source, confidence) go into `details` jsonb, which already
// holds check_in / check_out / flight_number / terminal / address - so no
// migration is needed.

import { getSupabase } from "@/lib/supabase";
import type { TablesInsert } from "@/lib/database.types";
import type { PasteBooking } from "@/supabase/functions/_shared/bookingPaste";

export type { PasteBooking };

export type PasteError =
  | "forbidden"
  | "disabled"
  | "not_configured"
  | "too_short"
  | "too_long"
  | "rate_limited"
  | "no_credit"
  | "timeout"
  | "extract_failed"
  | "offline";

export async function extractBookingFromPaste(text: string): Promise<{ booking: PasteBooking | null; remainingToday: number | null }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  const supabase = getSupabase();
  if (!supabase) throw new Error("not_configured");
  const { data, error } = await supabase.functions.invoke("booking-paste", { body: { text } });
  if (error) {
    // Non-2xx: the function's code is in the response body.
    let code: string | undefined = (data as { error?: string } | null)?.error;
    if (!code) {
      try {
        code = (await (error as { context?: Response }).context?.json())?.error;
      } catch {
        // fall through
      }
    }
    throw new Error(code ?? "extract_failed");
  }
  if (!data?.ok) throw new Error((data as { error?: string })?.error ?? "extract_failed");
  return { booking: (data.booking as PasteBooking | null) ?? null, remainingToday: (data.remainingToday as number) ?? null };
}

/** The reviewed paste as a bookings row. Pure, so it is tested. */
export function pasteToInsert(tripId: string, b: PasteBooking): TablesInsert<"bookings"> {
  const details: Record<string, unknown> = { source: "paste", confidence: b.confidence };
  if (b.type === "hotel") {
    if (b.start_time) details.check_in = b.start_time;
    if (b.end_time) details.check_out = b.end_time;
  } else {
    if (b.start_time) details.departure_time = b.start_time;
    if (b.end_time) details.arrival_time = b.end_time;
  }
  if (b.flight_number) details.flight_number = b.flight_number;
  if (b.terminal) details.terminal = b.terminal;
  if (b.address) details.address = b.address;
  if (b.provider) details.provider = b.provider;
  return {
    trip_id: tripId,
    type: b.type,
    title: b.title,
    start_date: b.start_date,
    end_date: b.end_date,
    confirmation_code: b.confirmation_code,
    cost: b.cost,
    currency: b.cost === null ? null : (b.currency ?? "ILS"),
    status: "booked",
    notes: b.notes,
    details: details as TablesInsert<"bookings">["details"],
  };
}
