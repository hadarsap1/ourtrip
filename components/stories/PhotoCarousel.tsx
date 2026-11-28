"use client";

import { useCallback, useRef, useState } from "react";
import { VideoFrame } from "@/components/photos/VideoFrame";
import { PhotoLightbox } from "@/components/stories/PhotoLightbox";
import { forgetSignedUrl } from "@/lib/data/signedUrls";
import { photoUrls } from "@/lib/data/media";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

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
 *
 * A short video (00099) is one of the slides: its poster frame with a play
 * button, the video itself only after a tap.
 *
 * A tap on a photo opens it big, on the whole screen (Hadar 24/11/2026).
 *
 * A photo that fails to load is signed again once (Hadar 28/11/2026: the
 * fourth photo of an update showed a broken image). Signed links live an
 * hour and the later slides load only when swiped to, so a feed left open
 * longer asked for a link that had already run out. If the second link fails
 * too, a quiet "did not load" frame takes the place of the broken icon.
 */

const TALLEST = 4 / 5;
const WIDEST = 16 / 9;
const DEFAULT_RATIO = 4 / 3;
type Slide = { photoId: string; url: string | null; videoUrl?: string | null };

export function PhotoCarousel({ photos }: { photos: Slide[] }) {
  const { member } = useMember();
  // links signed again after a failed load, by photo id
  const [resigned, setResigned] = useState<Record<string, string>>({});
  // photos that failed even after signing again
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const retried = useRef(new Set<string>());
  const shown = photos
    .filter((p) => Boolean(p.url || p.videoUrl))
    .map((p) => (resigned[p.photoId] ? { ...p, url: resigned[p.photoId] } : p));
  const scroller = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  // width / height of the frame, from the first photo once it loads
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  // the slide opened big, or null
  const [big, setBig] = useState<number | null>(null);
  const closeBig = useCallback(() => setBig(null), []);
  if (shown.length === 0) return null;

  const markFailed = (id: string) => setFailed((prev) => new Set(prev).add(id));
  const onPhotoError = (p: Slide) => {
    if (retried.current.has(p.photoId)) {
      markFailed(p.photoId);
      return;
    }
    retried.current.add(p.photoId);
    if (p.url) forgetSignedUrl(p.url);
    // the same role-aware signing the feed used: RLS (or guest-media) decides again
    photoUrls(member?.role, [p.photoId])
      .then((urls) => {
        const url = urls.get(p.photoId);
        if (url && url !== p.url) setResigned((prev) => ({ ...prev, [p.photoId]: url }));
        else markFailed(p.photoId);
      })
      .catch(() => markFailed(p.photoId));
  };

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
    <div className="relative border-b border-line">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto bg-sv-paper [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ aspectRatio: String(ratio) }}
      >
        {shown.map((p, i) => {
          const alt =
            shown.length > 1
              ? strings.stories.photoOf.replace("{i}", String(i + 1)).replace("{n}", String(shown.length))
              : "";
          // a cached photo can finish before React listens, hence the ref too
          const firstRef = i === 0 ? (img: HTMLImageElement | null) => { if (img?.complete) onFirstLoad(img); } : undefined;
          if (p.videoUrl) {
            return (
              <VideoFrame
                key={p.photoId}
                poster={p.url}
                src={p.videoUrl}
                alt={alt}
                posterRef={firstRef}
                onPosterLoad={i === 0 ? onFirstLoad : undefined}
                className="h-full w-full shrink-0 snap-start"
              />
            );
          }
          if (failed.has(p.photoId)) {
            return (
              <div
                key={p.photoId}
                className="grid h-full w-full shrink-0 snap-start place-items-center text-sm text-muted"
              >
                {strings.stories.photoFailed}
              </div>
            );
          }
          return (
            <button
              key={p.photoId}
              type="button"
              onClick={() => setBig(i)}
              aria-label={strings.stories.openPhoto}
              className="h-full w-full shrink-0 snap-start cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
              <img
                src={p.url ?? undefined}
                alt={alt}
                loading={i === 0 ? "eager" : "lazy"}
                ref={firstRef}
                onLoad={i === 0 ? (e) => onFirstLoad(e.currentTarget) : undefined}
                onError={() => onPhotoError(p)}
                className="h-full w-full object-contain"
              />
            </button>
          );
        })}
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
      {big !== null && <PhotoLightbox photos={shown} start={big} onClose={closeBig} />}
    </div>
  );
}
