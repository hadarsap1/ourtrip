"use client";

import { useRef, useState } from "react";
import { strings } from "@/lib/strings";

/**
 * An update's photos on top of its card, swiped one by one (Hadar
 * 01/11/2026: the second photo onward sat in a small grid under the text and
 * read as "one photo per update"). Native scroll-snap, no library: it swipes
 * with the finger, in RTL, and works offline with whatever the browser cached.
 *
 * Never cropped (Hadar 05/11/2026): every photo is shown whole. The frame
 * takes the first photo's shape, held between 4:5 (tall) and 16:9 (wide) so a
 * very tall photo does not fill the screen; a photo of another shape gets
 * plain margins instead of losing its edges.
 */

const TALLEST = 4 / 5;
const WIDEST = 16 / 9;
const DEFAULT_RATIO = 4 / 3;
export function PhotoCarousel({ photos }: { photos: { photoId: string; url: string | null }[] }) {
  const shown = photos.filter((p): p is { photoId: string; url: string } => Boolean(p.url));
  const scroller = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  // width / height of the frame, from the first photo once it loads
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  if (shown.length === 0) return null;

  const onFirstLoad = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    setRatio(Math.min(WIDEST, Math.max(TALLEST, img.naturalWidth / img.naturalHeight)));
  };

  // RTL scrollLeft runs negative in every engine we ship to; the size is the same
  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(shown.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };
  const goTo = (i: number) => {
    const el = scroller.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  return (
    <div className="relative border-b-2 border-sv-line">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto bg-sv-paper [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ aspectRatio: String(ratio) }}
      >
        {shown.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            key={p.photoId}
            src={p.url}
            alt={shown.length > 1 ? strings.stories.photoOf.replace("{i}", String(i + 1)).replace("{n}", String(shown.length)) : ""}
            loading={i === 0 ? "eager" : "lazy"}
            // a cached photo can finish before React listens, hence the ref too
            ref={i === 0 ? (img) => { if (img?.complete) onFirstLoad(img); } : undefined}
            onLoad={i === 0 ? (e) => onFirstLoad(e.currentTarget) : undefined}
            className="h-full w-full shrink-0 snap-start object-contain"
          />
        ))}
      </div>
      {shown.length > 1 && (
        <>
          <span
            className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white"
            dir="ltr"
          >
            {index + 1}/{shown.length}
          </span>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {shown.map((p, i) => (
              <button
                key={p.photoId}
                type="button"
                onClick={() => goTo(i)}
                aria-label={strings.stories.photoOf.replace("{i}", String(i + 1)).replace("{n}", String(shown.length))}
                aria-current={i === index}
                className="grid h-6 w-4 place-items-center"
              >
                <span className={`block h-2 w-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"} shadow`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
