import { getSupabase } from "@/lib/supabase";
import { getCurrentMember } from "@/lib/data/trip";
import { readMapSnapshot, saveMapSnapshot } from "@/lib/offline/caches";
import { todayISO } from "@/lib/format";
import type { Json } from "@/lib/database.types";
import type { ItineraryItem, MapPin, SavedRoute } from "@/lib/types";

const BUCKET = "map-photos";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

// Day pin colors — cycled by day index on the map screen.
export const DAY_COLORS = [
  "#0d9488", "#2563eb", "#d97706", "#dc2626", "#7c3aed",
  "#db2777", "#65a30d", "#0891b2", "#ea580c", "#4f46e5",
];

/** Google Maps deep link for navigation (SPEC 2.6). */
export function navigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// ---------- custom pins ----------

export async function listPins(tripId: string): Promise<MapPin[]> {
  const { data, error } = await requireClient()
    .from("map_pins")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function createPin(input: {
  tripId: string;
  label: string;
  kind?: string;
  lat: number;
  lng: number;
  photoPath?: string | null;
}): Promise<void> {
  const supabase = requireClient();
  const member = await getCurrentMember();
  if (!member) throw new Error("no member");
  const { error } = await supabase.from("map_pins").insert({
    trip_id: input.tripId,
    label: input.label.trim(),
    kind: input.kind ?? "custom",
    lat: input.lat,
    lng: input.lng,
    photo_path: input.photoPath ?? null,
    created_by: member.id,
  });
  if (error) throw new Error(error.message);
}

export async function deletePin(pin: MapPin): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("map_pins").delete().eq("id", pin.id);
  if (error) throw new Error(error.message);
  if (pin.photo_path) {
    await supabase.storage.from(BUCKET).remove([pin.photo_path]);
  }
}

// ---------- where's the car (single active car pin) ----------

export async function getCarPin(tripId: string): Promise<MapPin | null> {
  const { data, error } = await requireClient()
    .from("map_pins")
    .select("*")
    .eq("trip_id", tripId)
    .eq("kind", "car")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Replaces any previous car pin; optional photo of the parking spot. */
export async function saveCarPin(input: {
  tripId: string;
  lat: number;
  lng: number;
  label: string;
  photo?: File | null;
}): Promise<void> {
  const supabase = requireClient();

  let photoPath: string | null = null;
  if (input.photo) {
    photoPath = `car/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(photoPath, input.photo, {
        contentType: input.photo.type || "image/jpeg",
      });
    if (error) throw new Error(error.message);
  }

  const old = await getCarPin(input.tripId);
  await createPin({
    tripId: input.tripId,
    label: input.label,
    kind: "car",
    lat: input.lat,
    lng: input.lng,
    photoPath,
  });
  if (old) await deletePin(old);
}

/** Attach/replace the parking photo on an existing car pin. */
export async function updateCarPhoto(pin: MapPin, photo: File): Promise<void> {
  const supabase = requireClient();
  const path = `car/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: photo.type || "image/jpeg" });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase
    .from("map_pins")
    .update({ photo_path: path })
    .eq("id", pin.id);
  if (error) throw new Error(error.message);
  if (pin.photo_path) {
    await supabase.storage.from(BUCKET).remove([pin.photo_path]);
  }
}

export async function getPinPhotoUrl(path: string): Promise<string> {
  const { data, error } = await requireClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Current device position (owner tap → save car). */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// ---------- saved routes ----------

export async function listRoutes(tripId: string): Promise<SavedRoute[]> {
  const { data, error } = await requireClient()
    .from("routes")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

export async function createRoute(input: {
  tripId: string;
  name: string;
  path: [number, number][]; // [lat, lng] points
  color: string;
  dayId?: string | null;
}): Promise<void> {
  const supabase = requireClient();
  const member = await getCurrentMember();
  if (!member) throw new Error("no member");
  const { error } = await supabase.from("routes").insert({
    trip_id: input.tripId,
    name: input.name.trim(),
    path: input.path as unknown as Json,
    color: input.color,
    day_id: input.dayId ?? null,
    created_by: member.id,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRoute(id: string): Promise<void> {
  const { error } = await requireClient().from("routes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function routePath(route: SavedRoute): [number, number][] {
  return Array.isArray(route.path) ? (route.path as [number, number][]) : [];
}

// ---------- today's static map snapshot (offline mini-map) ----------

/**
 * Fetches a Static Maps image of today's item area, caches it in IndexedDB,
 * and returns an object URL. Offline (or if the Static Maps API is not
 * enabled on the key) it falls back to the cached snapshot; null hides the
 * mini-map entirely — the feature degrades, never blocks.
 */
export async function getTodayMapSnapshotUrl(
  items: Pick<ItineraryItem, "lat" | "lng">[]
): Promise<string | null> {
  const cachedFirst = async () => {
    const snapshot = await readMapSnapshot();
    return snapshot ? URL.createObjectURL(snapshot.blob) : null;
  };

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const points = items.filter(
    (i): i is { lat: number; lng: number } => i.lat != null && i.lng != null
  );
  if (!key || points.length === 0 || typeof navigator === "undefined" || !navigator.onLine) {
    return cachedFirst();
  }

  try {
    const markers = points
      .slice(0, 15)
      .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      .join("|");
    const url =
      `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2` +
      `&language=he&markers=color:0x0d9488|${encodeURIComponent(markers)}` +
      `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not an image");
    await saveMapSnapshot(blob, todayISO());
    return URL.createObjectURL(blob);
  } catch {
    return cachedFirst();
  }
}
