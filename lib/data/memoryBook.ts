import { listStories, type Story } from "@/lib/data/stories";
import { listPhotos, type PhotoWithUrl } from "@/lib/data/photos";
import type { Trip } from "@/lib/types";

export type MemoryEntry = Omit<Story, "photos"> & { photos: PhotoWithUrl[] };
export type MemoryAlbumDay = { date: string; photos: PhotoWithUrl[] };

export type MemoryBook = {
  tripName: string;
  entries: MemoryEntry[];
  album: MemoryAlbumDay[];
  photoCount: number;
};

/**
 * Assembles the printable memory book (B2): the journal's saved entries
 * (posts, 00078) in chronological order each with their approved photos, then an album of the remaining
 * approved photos grouped by the day they were taken. Owner-only screen; only
 * approved photos are included (rejected/pending are never in the book).
 */
export async function loadMemoryBook(trip: Trip): Promise<MemoryBook> {
  const [journal, photos] = await Promise.all([
    listStories(trip.id, "owner"),
    listPhotos(trip.id),
  ]);

  const approved = photos.filter((p) => p.status === "approved" && p.url);
  const linked = new Set<string>();

  const entries: MemoryEntry[] = journal
    .filter((e) => e.status === "approved")
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))
    .map((e) => {
      const ps = e.photos
        .map((link) => approved.find((p) => p.id === link.photoId))
        .filter((p): p is PhotoWithUrl => Boolean(p));
      ps.forEach((p) => linked.add(p.id));
      return { ...e, photos: ps };
    });

  const byDate = new Map<string, PhotoWithUrl[]>();
  for (const p of approved) {
    if (linked.has(p.id)) continue;
    const list = byDate.get(p.taken_on) ?? [];
    list.push(p);
    byDate.set(p.taken_on, list);
  }
  const album: MemoryAlbumDay[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, ps]) => ({ date, photos: ps }));

  return {
    tripName: trip.name,
    entries,
    album,
    photoCount: approved.length,
  };
}
