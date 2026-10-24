// Parents' podcast editor (docs/DESIGN-sharing.md §2, 13/10): keep a part,
// cut a part out, add more at the end, then save. Everything here works on
// plain mono samples so it can be tested without a browser.
//
// Why WAV on save: the browser can decode every format it records, but it
// cannot ENCODE compressed audio to a file without a muxing library
// (CLAUDE.md rule #7: no dependency without a reason). 16 kHz mono 16-bit is
// wideband-voice quality at ~1.9 MB a minute - a full 20-minute episode is
// ~38 MB, inside the bucket's 50 MB limit (00047) - and WAV plays on every
// phone.

/** Sample rate an edited episode is decoded to, edited at and saved in. */
export const EDIT_SAMPLE_RATE = 16_000;

export type Clip = { samples: Float32Array; sampleRate: number };

export function durationOf(clip: Clip): number {
  return clip.samples.length / clip.sampleRate;
}

function index(clip: Clip, seconds: number): number {
  return Math.max(0, Math.min(clip.samples.length, Math.round(seconds * clip.sampleRate)));
}

/** Keep only [start, end). */
export function keepRange(clip: Clip, start: number, end: number): Clip {
  const [a, b] = [index(clip, Math.min(start, end)), index(clip, Math.max(start, end))];
  return { samples: clip.samples.slice(a, b), sampleRate: clip.sampleRate };
}

/** Remove [start, end), joining what was before and after it. */
export function cutRange(clip: Clip, start: number, end: number): Clip {
  const [a, b] = [index(clip, Math.min(start, end)), index(clip, Math.max(start, end))];
  const out = new Float32Array(clip.samples.length - (b - a));
  out.set(clip.samples.subarray(0, a), 0);
  out.set(clip.samples.subarray(b), a);
  return { samples: out, sampleRate: clip.sampleRate };
}

/**
 * Append `tail` after `head`, with a short pause between them so two takes do
 * not run into each other. Both must already be at the same rate (the editor
 * decodes everything at EDIT_SAMPLE_RATE).
 */
export function appendClip(head: Clip, tail: Clip, gapSeconds = 0.4): Clip {
  if (head.sampleRate !== tail.sampleRate) throw new Error("sample rates differ");
  const gap = head.samples.length && tail.samples.length ? Math.round(gapSeconds * head.sampleRate) : 0;
  const out = new Float32Array(head.samples.length + gap + tail.samples.length);
  out.set(head.samples, 0);
  out.set(tail.samples, head.samples.length + gap);
  return { samples: out, sampleRate: head.sampleRate };
}

/**
 * Shortens every pause longer than `longerThan` seconds to `keep` seconds -
 * half of it after the words before, half before the words after - so the
 * episode keeps its breathing room without the long gaps. Runs on the
 * device, offline, no AI service needed.
 *
 * "Quiet" is relative to this recording: a 20 ms frame is quiet when it is
 * close to the recording's own background level (10th percentile of frame
 * loudness) rather than to its speech (95th), so a noisy café and a silent
 * hotel room both work. Every join gets a 5 ms fade so it does not click.
 */
export function shortenSilences(
  clip: Clip,
  { keep = 0.5, longerThan = 0.7 }: { keep?: number; longerThan?: number } = {}
): { clip: Clip; removedSeconds: number } {
  const { samples, sampleRate } = clip;
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  const frames = Math.floor(samples.length / frame);
  const unchanged = { clip, removedSeconds: 0 };
  if (frames < 2) return unchanged;

  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = Float32Array.from(rms).sort();
  const floor = sorted[Math.floor(frames * 0.1)];
  const loud = sorted[Math.min(frames - 1, Math.floor(frames * 0.95))];
  // nothing above the background: an all-quiet take, leave it alone
  if (loud < 0.01 || loud < floor * 2) return unchanged;
  const threshold = Math.max(0.003, floor + (loud - floor) * 0.1);

  const half = Math.round((keep / 2) * sampleRate);
  const minRun = Math.round(longerThan * sampleRate);
  // [from, to) sample ranges to drop
  const drop: [number, number][] = [];
  let f = 0;
  while (f < frames) {
    if (rms[f] >= threshold) {
      f++;
      continue;
    }
    const runStart = f;
    while (f < frames && rms[f] < threshold) f++;
    const a = runStart * frame;
    const b = f === frames ? samples.length : f * frame;
    if (b - a <= minRun) continue;
    const from = a === 0 ? 0 : a + half;
    const to = b === samples.length ? b : b - half;
    // the opening and closing pauses keep only their half next to the words
    if (a === 0 && to - from > 0) drop.push([0, b - half]);
    else if (b === samples.length) drop.push([a + half, b]);
    else if (to > from) drop.push([from, to]);
  }
  if (drop.length === 0) return unchanged;

  const removed = drop.reduce((n, [a, b]) => n + (b - a), 0);
  const out = new Float32Array(samples.length - removed);
  const fade = Math.round(sampleRate * 0.005);
  let at = 0;
  let from = 0;
  for (const [a, b] of [...drop, [samples.length, samples.length] as [number, number]]) {
    const part = samples.subarray(from, a);
    out.set(part, at);
    // fade out the end of a kept part and fade in the start of the next
    if (a < samples.length) for (let i = 0; i < Math.min(fade, part.length); i++) out[at + part.length - 1 - i] *= i / fade;
    if (from > 0) for (let i = 0; i < Math.min(fade, part.length); i++) out[at + i] *= i / fade;
    at += part.length;
    from = b;
  }
  return { clip: { samples: out, sampleRate }, removedSeconds: removed / sampleRate };
}

/** Average all channels into one. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Loudest absolute value per bucket, 0..1 - the waveform drawing. */
export function peaks(samples: Float32Array, buckets: number): number[] {
  if (samples.length === 0 || buckets <= 0) return [];
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const out: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    out.push(Math.min(1, max));
  }
  return out;
}

/** 16-bit PCM WAV. */
export function encodeWav(clip: Clip): Blob {
  const { samples, sampleRate } = clip;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// In memory a minute of edit audio is ~3.8 MB (Float32 at 16 kHz). Undo keeps
// whole copies, so a long episode gets fewer of them: about 100 MB in total
// is a safe ceiling on a phone.
const UNDO_SAMPLE_BUDGET = 24_000_000;

/** How many undo steps fit for a clip this long: 1 to 3. */
export function undoDepthFor(sampleCount: number): number {
  if (sampleCount <= 0) return 3;
  return Math.max(1, Math.min(3, Math.floor(UNDO_SAMPLE_BUDGET / sampleCount)));
}
