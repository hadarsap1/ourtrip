"use client";

import { useState, type Ref } from "react";
import { PlayIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

/**
 * A short video where a photo would be (00099): its poster frame with a play
 * button, and the video only once it is tapped. Nothing of the file is
 * fetched before that - a feed of videos costs the reader no data, and the
 * project's monthly transfer is small (Free plan).
 *
 * `className` is the box; `mediaClassName` sizes the poster and the video
 * alike, so the picture does not jump when it starts to play.
 */
export function VideoFrame({
  poster,
  src,
  alt = "",
  className,
  mediaClassName = "h-full w-full object-contain",
  posterRef,
  onPosterLoad,
}: {
  poster: string | null;
  src: string;
  alt?: string;
  className: string;
  mediaClassName?: string;
  posterRef?: Ref<HTMLImageElement>;
  onPosterLoad?: (img: HTMLImageElement) => void;
}) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        // the signed link is for watching here, not for saving
        controlsList="nodownload"
        className={`bg-black ${className} ${mediaClassName}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={strings.stories.playVideo}
      className={`relative block bg-black ${className}`}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL
        <img
          src={poster}
          alt={alt}
          ref={posterRef}
          onLoad={onPosterLoad ? (e) => onPosterLoad(e.currentTarget) : undefined}
          className={mediaClassName}
        />
      )}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white shadow-lg">
          <PlayIcon className="h-9 w-9" />
        </span>
      </span>
    </button>
  );
}

/** The small mark on a thumbnail that says "this one is a video". */
export function VideoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={strings.stories.videoBadge}
      className={`pointer-events-none grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgba(10,20,18,0.7)] text-white ${className}`}
    >
      <PlayIcon className="h-4 w-4" />
    </span>
  );
}
