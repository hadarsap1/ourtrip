import { getSupabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Booking, BookingFile } from "@/lib/types";

const BUCKET = "booking-files";

/** What the bucket itself accepts (migration 00003). Checking here as well
 *  turns a storage rejection - which arrives as an opaque 400 after the upload
 *  has already been attempted - into a sentence next to the file, before
 *  anything is sent. */
export const BOOKING_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const BOOKING_FILE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

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

export async function updateBooking(
  id: string,
  patch: TablesUpdate<"bookings">
): Promise<void> {
  const { error } = await requireClient()
    .from("bookings")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBooking(id: string): Promise<void> {
  const supabase = requireClient();

  // Read the attachments before the booking goes: `booking_files` cascades on
  // the delete, so after it there is nothing left to say which objects in the
  // bucket belonged to it, and they would sit there against the quota forever.
  const { data: files } = await supabase
    .from("booking_files")
    .select("file_path")
    .eq("booking_id", id);

  // FK from itinerary_items/expenses restricts deletion of a linked booking
  // (23503) - the UI maps that to a Hebrew explanation.
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw new Error(error.code === "23503" ? "booking_linked" : error.message);

  if (files?.length) {
    await supabase.storage.from(BUCKET).remove(files.map((f) => f.file_path));
  }
}

// ---------- attachments ----------
//
// A booking holds any number of files (migration 00037). `bookings.file_path`
// still exists and still points at the first of them, but a database trigger
// owns it now - nothing here writes it.

/** Every attachment on the trip's bookings, oldest leg first.
 *
 *  One query rather than one per booking: `booking_files` carries no trip_id,
 *  so the filter rides an inner join through the parent booking. The joined
 *  column comes back nested and is dropped on the way out. */
export async function listBookingFiles(tripId: string): Promise<BookingFile[]> {
  const { data, error } = await requireClient()
    .from("booking_files")
    .select(
      "id, booking_id, file_path, file_name, mime_type, size_bytes, sort_order, created_at, bookings!inner(trip_id)"
    )
    .eq("bookings.trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  // Listed out rather than spread, so the joined `bookings` key is dropped
  // instead of riding along on an object typed as if it were not there.
  return data.map((row) => ({
    id: row.id,
    booking_id: row.booking_id,
    file_path: row.file_path,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    sort_order: row.sort_order,
    created_at: row.created_at,
  }));
}

/** Uploads one file and records it on the booking.
 *
 *  Storage first, row second. The other order would leave a row pointing at
 *  an object that does not exist, which reads as a file you can see and
 *  cannot open; this order can at worst leave an unreferenced object, which
 *  nobody sees. */
export async function uploadBookingFile(
  bookingId: string,
  file: File,
  sortOrder: number
): Promise<BookingFile> {
  const supabase = requireClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${bookingId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase
    .from("booking_files")
    .insert({
      booking_id: bookingId,
      file_path: path,
      // The name as picked, not the sanitised path: `דרכון.pdf` survives only
      // here, the path having had every non-ASCII character replaced.
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      sort_order: sortOrder,
    })
    .select("id, booking_id, file_path, file_name, mime_type, size_bytes, sort_order, created_at")
    .single();
  if (error) {
    // The row is what makes the object reachable, so an object without one is
    // dead weight in a bucket with a quota. Best effort: the insert already
    // failed, and a failed cleanup must not replace that error.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data;
}

/** Removes an attachment, object and row. */
export async function deleteBookingFile(file: BookingFile): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from("booking_files")
    .delete()
    .eq("id", file.id);
  if (error) throw new Error(error.message);
  // Row first here, for the mirror of the reason above: a row left behind
  // would show a file that cannot be opened. A leftover object shows nothing.
  await supabase.storage.from(BUCKET).remove([file.file_path]);
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
