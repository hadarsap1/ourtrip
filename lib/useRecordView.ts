"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useMember } from "@/lib/useMember";
import { countsViews, recordView } from "@/lib/recordView";
import { advanceHeard, seekHeard, type HeardState } from "@/lib/views";

/** How long an update has to be at least half on screen to count as seen. */
const ON_SCREEN_MS = 2000;
/** While listening, send the heard time every this many seconds of progress. */
const HEARD_STEP_S = 30;

/** An update in the feed: seen once its card was half on screen for 2 s. */
export function useRecordWhenOnScreen(ref: RefObject<Element | null>, postId: string, enabled: boolean): void {
  const { member } = useMember();
  const counts = enabled && countsViews(member);
  useEffect(() => {
    const el = ref.current;
    if (!counts || !el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timer ??= setTimeout(() => {
            void recordView({ postId });
            observer.disconnect();
          }, ON_SCREEN_MS);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ref, postId, counts]);
}

/** A photo: seen when its sheet opens. */
export function useRecordOnOpen(photoId: string): void {
  const { member } = useMember();
  const counts = countsViews(member);
  useEffect(() => {
    if (counts) void recordView({ photoId });
  }, [photoId, counts]);
}

/**
 * An episode: counted when play is pressed, then how far they listened - sent
 * on pause, at the end, when the app goes to the background, and every 30 s
 * of listening, so a tablet that dies mid-episode still says most of it.
 */
export function useRecordListening(
  audioRef: RefObject<HTMLAudioElement | null>,
  episodeId: string,
  /** the audio's URL: the element exists only once there is one */
  src: string | null
): void {
  const { member } = useMember();
  const counts = countsViews(member);
  const heard = useRef<HeardState>({ last: null, heard: 0 });
  const sent = useRef(-1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!counts || !audio) return;
    const send = (force = false) => {
      const now = Math.floor(heard.current.heard);
      if (!force && now === sent.current) return;
      sent.current = now;
      void recordView({ episodeId }, now);
    };
    const onPlay = () => {
      if (sent.current < 0) send(true);
    };
    const onTime = () => {
      heard.current = advanceHeard(heard.current, audio.currentTime);
      if (heard.current.heard - Math.max(0, sent.current) >= HEARD_STEP_S) send();
    };
    const onSeeked = () => {
      heard.current = seekHeard(heard.current, audio.currentTime);
    };
    const onEnded = () => {
      heard.current = advanceHeard(heard.current, audio.currentTime);
      send();
    };
    const onPause = () => send();
    const onHide = () => {
      if (document.visibilityState === "hidden" && sent.current >= 0) send();
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("seeking", onSeeked);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("seeking", onSeeked);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
      if (sent.current >= 0) send();
    };
  }, [audioRef, episodeId, counts, src]);
}
