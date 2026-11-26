"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A real <audio> with the native controls hidden and our own UI bound to it
 * (קרם חם): a 52px coral play/pause, a track with a green thumb, and the time.
 * The element stays in the page, so listening stats (useRecordListening),
 * media keys and the lock-screen player keep working. The seek bar is a
 * native range input, so it has keyboard support for free.
 */
export function AudioPlayer({
  src,
  audioRef,
  durationSeconds,
}: {
  src: string;
  /** handed to the caller too (listening stats) */
  audioRef?: RefObject<HTMLAudioElement | null>;
  /** known length, shown before the file's metadata loads (preload="none") */
  durationSeconds?: number | null;
}) {
  const own = useRef<HTMLAudioElement>(null);
  const ref = audioRef ?? own;
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [total, setTotal] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      setPlaying(!el.paused);
      setNow(el.currentTime);
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    };
    const events = ["play", "pause", "ended", "timeupdate", "loadedmetadata", "durationchange", "seeked"];
    events.forEach((e) => el.addEventListener(e, sync));
    return () => events.forEach((e) => el.removeEventListener(e, sync));
  }, [ref, src]);

  const progress = total > 0 ? Math.min(100, (now / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-full bg-bg py-1.5 pe-3.5 ps-1.5">
      <audio ref={ref} preload="none" src={src} className="hidden">
        <track kind="captions" />
      </audio>
      <button
        type="button"
        aria-label={playing ? strings.player.pause : strings.player.play}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
        }}
        className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-coral text-on-coral"
      >
        {playing ? <PauseIcon className="h-[22px] w-[22px]" /> : <PlayIcon className="h-[22px] w-[22px]" />}
      </button>
      <div className="relative flex h-11 min-w-0 flex-1 items-center">
        {/* the drawn track; the transparent range on top takes the input */}
        <div aria-hidden="true" className="relative h-1.5 w-full rounded-full bg-track">
          <div className="absolute inset-y-0 start-0 rounded-full bg-green" style={{ width: `${progress}%` }} />
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-green shadow-card"
            style={{ insetInlineStart: `calc(${progress}% - 7px)` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={1}
          value={Math.min(now, total || 0)}
          aria-label={strings.player.seek}
          aria-valuetext={strings.player.elapsed.replace("{now}", clock(now)).replace("{total}", clock(total))}
          onChange={(e) => {
            const el = ref.current;
            if (el) el.currentTime = Number(e.target.value);
          }}
          data-tap-exempt
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-muted" dir="ltr">
        {now > 0 ? `${clock(now)} / ${clock(total)}` : clock(total)}
      </span>
    </div>
  );
}
