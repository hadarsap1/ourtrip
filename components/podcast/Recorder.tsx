"use client";

import { useEffect, useRef, useState } from "react";
import { MicIcon, PauseIcon, PlayIcon, StopIcon } from "@/components/icons";
import { formatClock, MAX_EPISODE_SECONDS, pickRecordingMime } from "@/lib/audio";
import { strings } from "@/lib/strings";

type Phase = "idle" | "recording" | "paused" | "review";

export type Take = { blob: Blob; mime: string; durationSeconds: number };

/**
 * One continuous take with pause/resume (DESIGN-sharing §2), capped at
 * MAX_EPISODE_SECONDS. The microphone is released the moment recording stops
 * or the screen closes - the tablet's mic light should never stay on.
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
  const [take, setTake] = useState<(Take & { url: string }) | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const runStartRef = useRef<number | null>(null);
  const banked = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const elapsed = () =>
    banked.current + (runStartRef.current === null ? 0 : (performance.now() - runStartRef.current) / 1000);

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }

  useEffect(
    () => () => {
      releaseMic();
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    },
    []
  );

  useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take]
  );

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(strings.podcast.unsupported);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError(strings.podcast.micDenied);
      return;
    }
    streamRef.current = stream;
    const mime = pickRecordingMime((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(
      stream,
      // voice: 64 kbps is plenty and keeps a 20-minute take around 10 MB
      mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 }
    );
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const durationSeconds = Math.round(elapsed());
      runStartRef.current = null;
      banked.current = 0;
      releaseMic();
      setTake({ blob, mime: type, durationSeconds, url: URL.createObjectURL(blob) });
      setPhase("review");
    };
    recorderRef.current = recorder;
    banked.current = 0;
    runStartRef.current = performance.now();
    recorder.start(1000);
    setSeconds(0);
    setPhase("recording");
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
    banked.current = elapsed();
    runStartRef.current = null;
    setPhase("paused");
  }

  function resume() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    runStartRef.current = performance.now();
    setPhase("recording");
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
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
            ? strings.podcast.paused
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
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={phase === "recording" ? pause : resume}
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
