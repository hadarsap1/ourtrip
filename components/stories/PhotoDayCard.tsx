"use client";

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ViewedPhoto } from "@/components/photos/PhotoView";
import type { PhotoDay } from "@/lib/stories";

const SHOWN = 6;

/**
 * The day's photos that are in no update, as one card in the updates feed
 * (Hadar 31/10/2026). A tap opens the photo with its likes and comments; the
 * rest of the day is one tap away in the full grid.
 */
export function PhotoDayCard({
  day,
  onOpen,
}: {
  day: PhotoDay<ViewedPhoto>;
  onOpen: (photo: ViewedPhoto) => void;
}) {
  const shown = day.photos.slice(0, SHOWN);
  const hidden = day.photos.length - shown.length;
  const label =
    day.photos.length === 1
      ? strings.stories.photosDayOne
      : strings.stories.photosDay.replace("{n}", String(day.photos.length));

  return (
    <article className="overflow-hidden rounded-[20px] border border-sv-line bg-sv-card">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2.5 text-[12px] text-sv-ink-soft">
        <span className="font-bold text-ink">{label}</span>
        <span dir="ltr">{formatDate(day.date)}</span>
      </div>
      <ul className={`grid gap-1 px-1 pb-1 ${shown.length === 1 ? "grid-cols-1" : shown.length === 2 || shown.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {shown.map((photo, i) => {
          const last = i === shown.length - 1 && hidden > 0;
          return (
            <li key={photo.id} className="relative overflow-hidden rounded-[14px] bg-paper-deep">
              {last ? (
                <Link href="/photos" className="block" aria-label={strings.stories.allPhotos}>
                  <Thumb photo={photo} single={shown.length === 1} />
                  <span className="absolute inset-0 grid place-items-center bg-ink/45 text-xl font-extrabold text-paper">
                    {strings.stories.morePhotos.replace("{n}", String(hidden + 1))}
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(photo)}
                  aria-label={photo.caption ?? formatDate(photo.taken_on)}
                  className="block w-full"
                >
                  <Thumb photo={photo} single={shown.length === 1} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function Thumb({ photo, single }: { photo: ViewedPhoto; single: boolean }) {
  if (!photo.url) return <div className={single ? "aspect-[4/3]" : "aspect-square"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL
    <img
      src={photo.url}
      alt={photo.caption ?? ""}
      loading="lazy"
      className={`w-full object-cover ${single ? "aspect-[4/3]" : "aspect-square"}`}
    />
  );
}
