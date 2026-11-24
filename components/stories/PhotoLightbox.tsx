"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { VideoFrame } from "@/components/photos/VideoFrame";
import { strings } from "@/lib/strings";

type Slide = { photoId: string; url: string | null; videoUrl?: string | null };

/**
 * An update's photo opened big (Hadar 24/11/2026): the whole screen, black
 * behind it, swiped to the next one like the card. Closed by the X, by the
 * back-style Escape key, or by a tap on the dark margin. Nothing is fetched
 * again - the same signed URLs the card already loaded.
 */
export function PhotoLightbox({
  photos,
  start,
  onClose,
}: {
  photos: Slide[];
  start: number;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(start);

  // open on the tapped photo, without a visible scroll
  useLayoutEffect(() => {
    const el = scroller.current?.children[start] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // the feed under it must not scroll while it is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // RTL scrollLeft runs negative; the size is the same
  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(photos.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };

  const label = (i: number) =>
    strings.stories.photoOf.replace("{i}", String(i + 1)).replace("{n}", String(photos.length));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={strings.stories.photoBig}
      className="fixed inset-0 z-[70] flex flex-col bg-black"
    >
      <div className="flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.ui.close}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
        {photos.length > 1 && (
          <span className="text-sm font-bold text-white/90" dir="ltr">
            {index + 1}/{photos.length}
          </span>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((p, i) => (
          <div
            key={p.photoId}
            // a tap on the black around the photo closes it
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            className="flex h-full w-full shrink-0 snap-start items-center justify-center"
          >
            {p.videoUrl ? (
              <VideoFrame
                poster={p.url}
                src={p.videoUrl}
                alt={label(i)}
                className="h-full w-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img
                src={p.url ?? undefined}
                alt={photos.length > 1 ? label(i) : ""}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
