"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhotosIcon } from "@/components/icons";
import { loadAlbumNews, type AlbumNews } from "@/lib/data/albums";
import { strings } from "@/lib/strings";

// The in-app notification for albums (Hadar 09/11/2026: "guests should see
// that a new photo went up there" - no push). New = photos that became
// visible since I last opened the album (00087 + feedback_seen, 00081).
// Loaded on open and on return to the app; no realtime.

export function useAlbumNews(tripId: string | null, memberId: string | null, enabled: boolean): AlbumNews | null {
  const [news, setNews] = useState<AlbumNews | null>(null);
  useEffect(() => {
    if (!enabled || !tripId || !memberId) return;
    let alive = true;
    const load = () =>
      void loadAlbumNews(tripId, memberId)
        .then((n) => alive && setNews(n))
        // offline or refused: no line, the doors still work
        .catch(() => {});
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tripId, memberId, enabled]);
  return news;
}

export function albumNewsTotal(news: AlbumNews | null): number {
  if (!news) return 0;
  let total = 0;
  for (const n of news.fresh.values()) total += n;
  return total;
}

/** One line per album with something new; a tap opens the album. */
export function AlbumNewsLines({ news }: { news: AlbumNews | null }) {
  if (!news) return null;
  const lines = news.albums.filter((a) => (news.fresh.get(a.id) ?? 0) > 0);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-2">
      {lines.map((album) => (
        <li key={album.id}>
          <Link
            href={`/photos?album=${album.id}`}
            className="flex min-h-[44px] items-center gap-3 rounded-card border border-sv-line bg-sv-card px-4 py-2.5 active:bg-sv-sage-soft"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sv-sage-soft text-sv-sage">
              <PhotosIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-sv-ink" dir="auto">
              {strings.albums.homeFresh(news.fresh.get(album.id) ?? 0, album.name)}
            </span>
            <span className="shrink-0 text-xs font-bold text-sv-sage">{strings.albums.homeOpen} ←</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
