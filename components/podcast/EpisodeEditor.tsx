"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { askConfirm } from "@/components/ConfirmSheet";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { Recorder, type Take } from "@/components/podcast/Recorder";
import {
  appendClip,
  cutRange,
  durationOf,
  encodeWav,
  keepRange,
  peaks,
  shortenSilences,
  undoDepthFor,
  type Clip,
} from "@/lib/audioEdit";
import { decodeToClip, decodeUrl, playClip, type Playback } from "@/lib/audioDecode";
import { formatClock, MAX_EPISODE_SECONDS } from "@/lib/audio";
import { deleteEpisode, replaceEpisodeAudio, updateEpisodeDetails } from "@/lib/data/podcast";
import { strings } from "@/lib/strings";
import type { Episode } from "@/lib/types";

const BARS = 120;
// a pointer that moves less than this across the waveform is a tap, not a drag
const TAP_FRACTION = 0.015;
const NUDGE_SECONDS = 0.5;

/**
 * Parents edit an episode (13/10): rename it, keep or cut a marked part, add
 * a new take or another episode at the end, undo, save. Marking (17/10): drag
 * across the waveform, or tap "starts here" / "ends here" while listening,
 * then nudge by half a second; long pauses shorten in one tap. The edit is done on
 * this device and saved as a new file (00047); approval and sharing stay as
 * they were.
 */
export function EpisodeEditor({
  episode,
  url,
  others,
  urlOf,
  onClose,
  onSaved,
  onToast,
}: {
  episode: Episode;
  url: string | null;
  /** Other episodes that can be joined onto this one. */
  others: Episode[];
  urlOf: (id: string) => string | null;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string) => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description ?? "");
  const [clip, setClip] = useState<Clip | null>(null);
  // no signed URL at all = nothing to decode; details can still be edited
  const [failed, setFailed] = useState(!url);
  // undo restores the audio AND which episodes were joined onto it
  const [history, setHistory] = useState<{ clip: Clip; merged: Episode[] }[]>([]);
  // net edits applied; the audio differs from the saved file while > 0
  const [edits, setEdits] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  // where "play" starts from, and the playhead while playing
  const [cursor, setCursor] = useState(0);
  const [adding, setAdding] = useState<"none" | "record" | "episode">("none");
  const [merged, setMerged] = useState<Episode[]>([]);
  const [busy, setBusy] = useState(false);
  const playbackRef = useRef<Playback | null>(null);
  const dragRef = useRef<{ from: number; x: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    void decodeUrl(url)
      .then((c) => {
        if (cancelled) return;
        setClip(c);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      playbackRef.current?.stop();
    };
  }, [url]);

  // move the playhead while playing
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const p = playbackRef.current;
      if (p) setCursor(p.position());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const total = clip ? durationOf(clip) : 0;
  const bars = useMemo(() => (clip ? peaks(clip.samples, BARS) : []), [clip]);
  const [selA, selB] = [Math.min(start, end), Math.max(start, end)];
  const hasSelection = selB - selA >= 0.1;
  const tooLong = total > MAX_EPISODE_SECONDS;

  function apply(next: Clip, nextMerged: Episode[] = merged) {
    if (!clip) return;
    stop();
    // each undo step holds a whole take in memory; long episodes keep fewer
    const depth = undoDepthFor(Math.max(clip.samples.length, next.samples.length));
    setHistory((h) => [...h, { clip, merged }].slice(-depth));
    setClip(next);
    setMerged(nextMerged);
    setEdits((n) => n + 1);
    clearMarks();
  }

  function clearMarks() {
    setStart(0);
    setEnd(0);
    setCursor(0);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    stop();
    setHistory((h) => h.slice(0, -1));
    setClip(previous.clip);
    setMerged(previous.merged);
    setEdits((n) => n - 1);
    clearMarks();
  }

  /** The playhead now: live while playing, else where it was left. */
  function now(): number {
    return playbackRef.current?.position() ?? cursor;
  }

  function stop() {
    const p = playbackRef.current;
    if (p) {
      setCursor(p.position());
      p.stop();
    }
    playbackRef.current = null;
    setPlaying(false);
  }

  function play(from: number, to: number) {
    if (!clip) return;
    stop();
    setCursor(from);
    setPlaying(true);
    const playback = playClip(clip, from, to, () => {
      // a stop() already moved on to the next playback, or cleared it
      if (playbackRef.current !== playback) return;
      setCursor(playback.position());
      playbackRef.current = null;
      setPlaying(false);
    });
    playbackRef.current = playback;
  }

  function timeAt(e: React.PointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return x * total;
  }

  function onWavePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { from: timeAt(e), x: e.clientX };
  }

  function onWavePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    if (Math.abs(e.clientX - drag.x) < width * TAP_FRACTION) return;
    setStart(drag.from);
    setEnd(timeAt(e));
  }

  function onWavePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    if (Math.abs(e.clientX - drag.x) >= width * TAP_FRACTION) return;
    // a tap: listen from here
    const t = timeAt(e);
    if (playing) play(t, total);
    else setCursor(t);
  }

  function nudge(which: "start" | "end", delta: number) {
    const clamp = (v: number) => Math.max(0, Math.min(total, v + delta));
    // the marks may have been set in either order; nudge the one shown
    if ((which === "start") === start <= end) setStart(clamp(start));
    else setEnd(clamp(end));
  }

  function setMark(which: "start" | "end", t: number) {
    // keep start before end whichever is set first
    const [a, b] = which === "start" ? [t, Math.max(t, selB)] : [Math.min(t, selA), t];
    setStart(a);
    setEnd(b);
  }

  function shortenPauses() {
    if (!clip) return;
    const { clip: next, removedSeconds } = shortenSilences(clip);
    if (removedSeconds < 0.1) {
      onToast(strings.podcastEdit.noSilences);
      return;
    }
    apply(next);
    onToast(strings.podcastEdit.silencesShortened.replace("{n}", String(Math.round(removedSeconds))));
  }

  async function appendTake(take: Take): Promise<boolean> {
    if (!clip) return false;
    try {
      const extra = await decodeToClip(await take.blob.arrayBuffer());
      apply(appendClip(clip, extra));
      setAdding("none");
      onToast(strings.podcastEdit.appended);
      return true;
    } catch {
      onToast(strings.common.error);
      return false;
    }
  }

  async function appendEpisode(other: Episode) {
    const otherUrl = urlOf(other.id);
    if (!clip || !otherUrl || busy) return;
    setBusy(true);
    try {
      const extra = await decodeUrl(otherUrl);
      apply(appendClip(clip, extra), [...merged, other]);
      setAdding("none");
      onToast(strings.podcastEdit.appended);
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !title.trim() || tooLong) return;
    setBusy(true);
    stop();
    try {
      if (title !== episode.title || description !== (episode.description ?? "")) {
        await updateEpisodeDetails(episode.id, { title, description: description || null });
      }
      if (edits > 0 && clip) {
        await replaceEpisodeAudio(episode, encodeWav(clip), durationOf(clip));
      }
      if (merged.length && (await askConfirm(strings.podcastEdit.deleteMerged))) {
        for (const other of merged) await deleteEpisode(other);
      }
      onToast(strings.podcastEdit.saved);
      onSaved();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  const candidates = others.filter((o) => o.id !== episode.id && !merged.some((m) => m.id === o.id));

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={strings.podcastEdit.title}>
      <div className="space-y-4">
        <div>
          <label htmlFor="edit-ep-title" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.podcast.titleLabel}
          </label>
          <input
            id="edit-ep-title"
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="edit-ep-desc" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.podcast.descriptionLabel}
          </label>
          <textarea
            id="edit-ep-desc"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 focus:border-sea focus:outline-none"
          />
        </div>

        {failed ? (
          <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{strings.podcastEdit.decodeFailed}</p>
        ) : !clip ? (
          <p className="text-center text-sm text-ink-soft" role="status">
            {strings.podcastEdit.loading}
          </p>
        ) : (
          <section className="space-y-3">
            {/* Time runs left to right on a waveform, as on every audio player. */}
            <div
              dir="ltr"
              aria-hidden="true"
              onPointerDown={onWavePointerDown}
              onPointerMove={onWavePointerMove}
              onPointerUp={onWavePointerUp}
              onPointerCancel={() => (dragRef.current = null)}
              className="relative flex h-24 touch-none select-none items-center gap-px rounded-xl bg-paper-deep"
            >
              {bars.map((v, i) => {
                const t = ((i + 0.5) / BARS) * total;
                const inside = hasSelection && t >= selA && t <= selB;
                return (
                  <span
                    key={i}
                    className={`pointer-events-none flex-1 rounded-full ${inside ? "bg-sv-clay" : "bg-line"}`}
                    style={{ height: `${Math.max(6, v * 100)}%` }}
                  />
                );
              })}
              {total > 0 && (
                <span
                  className="pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-ink"
                  style={{ left: `${(cursor / total) * 100}%` }}
                />
              )}
            </div>
            <p className="text-center text-[12px] text-ink-soft">{strings.podcastEdit.waveHint}</p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => (playing ? stop() : play(cursor < total - 0.1 ? cursor : 0, total))}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink"
              >
                {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                {playing ? strings.podcastEdit.stopPlaying : strings.podcastEdit.play}
                <span dir="ltr" className="tabular-nums text-ink-soft">
                  {formatClock(cursor)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => play(selA, selB)}
                disabled={!hasSelection}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              >
                <PlayIcon className="h-4 w-4" /> {strings.podcastEdit.playSelection}
              </button>
              <button
                type="button"
                onClick={() => setMark("start", now())}
                className="rounded-xl bg-paper-deep py-2.5 text-sm font-semibold text-ink"
              >
                {strings.podcastEdit.markStart}
              </button>
              <button
                type="button"
                onClick={() => setMark("end", now())}
                className="rounded-xl bg-paper-deep py-2.5 text-sm font-semibold text-ink"
              >
                {strings.podcastEdit.markEnd}
              </button>
            </div>

            {hasSelection && (
              <div className="grid gap-1.5 rounded-xl border border-line p-2.5 text-sm text-ink-soft">
                {(["start", "end"] as const).map((which) => (
                  <div key={which} className="flex items-center justify-between gap-2">
                    <span>{which === "start" ? strings.podcastEdit.startLabel : strings.podcastEdit.endLabel}</span>
                    <div dir="ltr" className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => nudge(which, -NUDGE_SECONDS)}
                        aria-label={strings.podcastEdit.nudgeBack}
                        className="h-9 w-9 rounded-lg border border-line font-bold text-ink"
                      >
                        −
                      </button>
                      <span className="w-12 text-center tabular-nums text-ink">
                        {formatClock(which === "start" ? selA : selB)}
                      </span>
                      <button
                        type="button"
                        onClick={() => nudge(which, NUDGE_SECONDS)}
                        aria-label={strings.podcastEdit.nudgeForward}
                        className="h-9 w-9 rounded-lg border border-line font-bold text-ink"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => apply(keepRange(clip, selA, selB))}
                disabled={!hasSelection || (selA < 0.05 && selB > total - 0.05)}
                className="rounded-xl bg-sea-tint py-2.5 text-sm font-bold text-sea-deep disabled:opacity-50"
              >
                {strings.podcastEdit.keep}
              </button>
              <button
                type="button"
                onClick={() => apply(cutRange(clip, selA, selB))}
                disabled={!hasSelection}
                className="rounded-xl bg-alert-tint py-2.5 text-sm font-bold text-alert disabled:opacity-50"
              >
                {strings.podcastEdit.cut}
              </button>
              <button
                type="button"
                onClick={shortenPauses}
                className="col-span-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink"
              >
                {strings.podcastEdit.shortenSilences}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className={tooLong ? "font-bold text-alert" : "text-ink-soft"}>
                {tooLong
                  ? strings.podcastEdit.tooLong.replace("{n}", String(MAX_EPISODE_SECONDS / 60))
                  : strings.podcastEdit.length.replace("{time}", formatClock(total))}
              </span>
              {history.length > 0 && (
                <button type="button" onClick={undo} className="font-semibold text-sea underline-offset-4 hover:underline">
                  {strings.podcastEdit.undo}
                </button>
              )}
            </div>

            <fieldset className="space-y-2 rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-ink">{strings.podcastEdit.addTitle}</legend>
              {adding === "none" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding("record")}
                    className="rounded-xl border border-line py-2.5 text-sm font-semibold text-ink"
                  >
                    {strings.podcastEdit.recordMore}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding("episode")}
                    disabled={candidates.length === 0}
                    className="rounded-xl border border-line py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {strings.podcastEdit.appendEpisode}
                  </button>
                </div>
              )}
              {adding === "record" && <Recorder busy={busy} onAppend={appendTake} />}
              {adding === "episode" && (
                <ul className="space-y-1.5" aria-label={strings.podcastEdit.pickEpisode}>
                  {candidates.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void appendEpisode(o)}
                        className="w-full rounded-xl bg-paper-deep px-3 py-2.5 text-start text-sm font-semibold text-ink disabled:opacity-50"
                      >
                        {o.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {adding !== "none" && (
                <button
                  type="button"
                  onClick={() => setAdding("none")}
                  className="w-full rounded-xl py-2 text-sm text-ink-soft"
                >
                  {strings.common.cancel}
                </button>
              )}
            </fieldset>
          </section>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !title.trim() || tooLong}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {busy ? strings.podcastEdit.saving : strings.podcastEdit.save}
        </button>
      </div>
    </Sheet>
  );
}
