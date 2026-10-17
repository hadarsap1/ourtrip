"use client";

import { useEffect, useRef, useState } from "react";
import { MicIcon, PauseIcon, PlayIcon, StopIcon } from "@/components/icons";
import { formatClock, MAX_EPISODE_SECONDS, pickRecordingMime } from "@/lib/audio";
import { decodeToClip } from "@/lib/audioDecode";
import { appendClip, encodeWav } from "@/lib/audioEdit";
import { strings } from "@/lib/strings";

type Phase = "idle" | "recording" | "paused" | "joining" | "review";

export type Take = { blob: Blob; mime: string; durationSeconds: number };

type WakeLock = { release: () => Promise<void> };

/**
 * One take with pause/resume (DESIGN-sharing §2), capped at
 * MAX_EPISODE_SECONDS. The microphone is released the moment recording stops
 * or the screen closes - the tablet's mic light should never stay on.
 *
 * Screen off (17/10, iPhone): while recording the screen is kept on (Screen
 * Wake Lock). If the page is hidden anyway - the side button, a call - the
 * part recorded so far is closed and kept, and the take waits paused;
 * "resume" opens a new part on a fresh microphone. Parts of one take are
 * joined into one WAV on stop (lib/audioEdit.ts explains WAV).
 */
export function Recorder({
  busy,
  onSave,
  onAppend,
}: {
  busy: boolean;
  /** New episode: the review step asks for a title and saves. */
  onSave?: (take: Take, title: string, description: string) => Promise<boolean>;
  /** Editor: the review step only offers to add this take to the episode. */
  onAppend?: (take: Take) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // the last pause came from the screen going off, not from the pause button
  const [interrupted, setInterrupted] = useState(false);
  const [take, setTake] = useState<(Take & { url: string }) | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // one Blob per microphone session of this take
  const partsRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const finishingRef = useRef(false);
  const unmountedRef = useRef(false);
  const runStartRef = useRef<number | null>(null);
  const banked = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLock | null>(null);

  const elapsed = () =>
    banked.current + (runStartRef.current === null ? 0 : (performance.now() - runStartRef.current) / 1000);

  function bank() {
    banked.current = elapsed();
    runStartRef.current = null;
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopTick() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }

  async function keepScreenOn() {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } })
      .wakeLock;
    if (!wakeLock || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await wakeLock.request("screen");
    } catch {
      // low battery mode or an older browser: the hidden-page handling below still keeps the take
    }
  }

  function letScreenSleep() {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  function isLive() {
    const state = recorderRef.current?.state;
    return state === "recording" || state === "paused";
  }

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      releaseMic();
      stopTick();
      letScreenSleep();
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    };
  }, []);

  // iPhone stops the microphone when the screen locks: close the part first
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        // the system already dropped the wake lock
        wakeLockRef.current = null;
        if (isLive() && !finishingRef.current) recorderRef.current?.stop();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take]
  );

  /** Opens the microphone and starts a new part. False if it could not. */
  async function openPart(): Promise<boolean> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError(strings.podcast.micDenied);
      return false;
    }
    streamRef.current = stream;
    const mime = pickRecordingMime((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(
      stream,
      // voice: 64 kbps is plenty and keeps a 20-minute take around 10 MB
      mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 }
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "audio/webm";
      mimeRef.current = type;
      if (chunks.length) partsRef.current.push(new Blob(chunks, { type }));
      bank();
      releaseMic();
      letScreenSleep();
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (unmountedRef.current) return;
      if (finishingRef.current) {
        void finish();
      } else {
        // the screen went off, a call came in, or the mic was taken away
        setInterrupted(true);
        setPhase("paused");
      }
    };
    // a call or another app can take the microphone without hiding the page
    stream.getAudioTracks().forEach((t) =>
      t.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      })
    );
    recorderRef.current = recorder;
    recorder.start(1000);
    runStartRef.current = performance.now();
    void keepScreenOn();
    return true;
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(strings.podcast.unsupported);
      return;
    }
    partsRef.current = [];
    finishingRef.current = false;
    banked.current = 0;
    setInterrupted(false);
    if (!(await openPart())) return;
    setSeconds(0);
    setPhase("recording");
    stopTick();
    tickRef.current = setInterval(() => {
      const now = elapsed();
      setSeconds(now);
      if (now >= MAX_EPISODE_SECONDS) stop();
    }, 250);
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    bank();
    letScreenSleep();
    setPhase("paused");
  }

  async function resume() {
    setError(null);
    setInterrupted(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "paused") {
      recorder.resume();
      runStartRef.current = performance.now();
      void keepScreenOn();
      setPhase("recording");
      return;
    }
    // the last part was closed when the screen went off: open a new one
    if (await openPart()) setPhase("recording");
  }

  function stop() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopTick();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else void finish();
  }

  /** Turns the parts into one take for review. */
  async function finish() {
    const parts = partsRef.current;
    const durationSeconds = Math.round(elapsed());
    finishingRef.current = false;
    setInterrupted(false);
    if (parts.length === 0) {
      reset();
      return;
    }
    let blob = parts[0];
    let mime = mimeRef.current;
    if (parts.length > 1) {
      setPhase("joining");
      try {
        let joined = await decodeToClip(await parts[0].arrayBuffer());
        for (const part of parts.slice(1)) joined = appendClip(joined, await decodeToClip(await part.arrayBuffer()), 0);
        blob = encodeWav(joined);
        mime = "audio/wav";
      } catch {
        // keep the longest part rather than nothing
        blob = parts.reduce((a, b) => (b.size > a.size ? b : a));
        setError(strings.podcast.joinFailed);
      }
    }
    if (unmountedRef.current) return;
    setTake({ blob, mime, durationSeconds, url: URL.createObjectURL(blob) });
    setPhase("review");
  }

  function reset() {
    setTake(null);
    setSeconds(0);
    setTitle("");
    setDescription("");
    setPhase("idle");
  }

  const progress = Math.min(1, seconds / MAX_EPISODE_SECONDS);

  if (phase === "review" && take && onAppend) {
    return (
      <div className="space-y-3">
        <audio controls src={take.url} className="w-full" />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="rounded-2xl border border-sv-line py-3 font-semibold text-sv-ink-soft disabled:opacity-60"
          >
            {strings.podcast.rerecord}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void onAppend(take).then((added) => {
                if (added) reset();
              })
            }
            className="rounded-2xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60"
          >
            {strings.podcastEdit.appendTake}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "review" && take && onSave) {
    return (
      <div className="space-y-3">
        <audio controls src={take.url} className="w-full" />
        <div>
          <label htmlFor="ep-title" className="mb-1 block text-sm font-semibold text-sv-ink">
            {strings.podcast.titleLabel}
          </label>
          <input
            id="ep-title"
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-2xl border border-sv-line bg-sv-card px-3 py-2.5 text-sv-ink focus:border-sv-sage focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="ep-desc" className="mb-1 block text-sm font-semibold text-sv-ink">
            {strings.podcast.descriptionLabel}
          </label>
          <textarea
            id="ep-desc"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-2xl border border-sv-line bg-sv-card px-3 py-2.5 text-sv-ink focus:border-sv-sage focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="rounded-2xl border border-sv-line py-3 font-semibold text-sv-ink-soft disabled:opacity-60"
          >
            {strings.podcast.rerecord}
          </button>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() =>
              void onSave(take, title, description).then((saved) => {
                if (saved) reset();
              })
            }
            className="rounded-2xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60"
          >
            {busy ? strings.podcast.saving : strings.podcast.save}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[40px] font-extrabold leading-none tabular-nums text-ink" aria-live="off" dir="ltr">
        {formatClock(seconds)}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sv-line" aria-hidden="true">
        <div className="h-full rounded-full bg-sv-clay" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="text-[12px] text-sv-ink-soft" role="status">
        {phase === "recording"
          ? strings.podcast.recording
          : phase === "paused"
            ? interrupted
              ? strings.podcast.interrupted
              : strings.podcast.paused
            : phase === "joining"
              ? strings.podcast.joining
              : strings.podcast.maxNote.replace("{n}", String(MAX_EPISODE_SECONDS / 60))}
      </p>

      {phase === "idle" ? (
        <button
          type="button"
          onClick={() => void start()}
          className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-sv-ink bg-sv-clay-fill text-white"
          aria-label={strings.podcast.record}
        >
          <MicIcon className="h-9 w-9" />
        </button>
      ) : phase === "joining" ? null : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={phase === "recording" ? pause : () => void resume()}
            aria-label={phase === "recording" ? strings.podcast.pause : strings.podcast.resume}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-sv-line bg-sv-card text-sv-ink"
          >
            {phase === "recording" ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={stop}
            aria-label={strings.podcast.stop}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-sv-ink bg-sv-clay-fill text-white"
          >
            <StopIcon className="h-8 w-8" />
          </button>
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-sv-clay-soft px-3 py-2 text-sm text-sv-clay" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
