import { getSupabase } from "@/lib/supabase";
import { assertMatched } from "@/lib/data/concurrency";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Booking } from "@/lib/types";

const BUCKET = "booking-files";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

export async function listBookings(tripId: string): Promise<Booking[]> {
  const { data, error } = await requireClient()
    .from("bookings")
    .select("*")
    .eq("trip_id", tripId)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createBooking(
  booking: TablesInsert<"bookings">
): Promise<Booking> {
  const { data, error } = await requireClient()
    .from("bookings")
    .insert(booking)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** `expectedUpdatedAt` guards against the other owner having saved first
 *  (audit S-3) — see updateItem for the full note. */
export async function updateBooking(
  id: string,
  patch: TablesUpdate<"bookings">,
  expectedUpdatedAt?: string
): Promise<void> {
  let query = requireClient().from("bookings").update(patch).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  assertMatched(data?.length ?? 0, expectedUpdatedAt);
}

export async function deleteBooking(id: string): Promise<void> {
  // FK from itinerary_items/expenses restricts deletion of a linked booking
  // (23503) — the UI maps that to a Hebrew explanation.
  const { error } = await requireClient().from("bookings").delete().eq("id", id);
  if (error) throw new Error(error.code === "23503" ? "booking_linked" : error.message);
}

// ---------- attachments ----------

/** Uploads an attachment and records its path on the booking. Returns path. */
export async function uploadBookingFile(
  bookingId: string,
  file: File
): Promise<string> {
  const supabase = requireClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${bookingId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase
    .from("bookings")
    .update({ file_path: path })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  return path;
}

/** Short-lived signed URL for opening an attachment. */
export async function getBookingFileUrl(path: string): Promise<string> {
  const { data, error } = await requireClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------- realtime ----------

export function subscribeBookings(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("bookings-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bookings" },
      onChange
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
