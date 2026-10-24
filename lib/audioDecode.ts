// Browser-only: turn an episode file (or a fresh take) into editable mono
// samples at EDIT_SAMPLE_RATE. decodeAudioData resamples to the context's
// rate, so every clip in the editor ends up at the same rate and can be
// joined (lib/audioEdit.ts).

import { EDIT_SAMPLE_RATE, toMono, type Clip } from "@/lib/audioEdit";

let ctx: AudioContext | null = null;

export function editContext(): AudioContext {
  ctx ??= new AudioContext({ sampleRate: EDIT_SAMPLE_RATE });
  return ctx;
}

export async function decodeToClip(data: ArrayBuffer): Promise<Clip> {
  const buffer = await editContext().decodeAudioData(data);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return { samples: toMono(channels), sampleRate: buffer.sampleRate };
}

export async function decodeUrl(url: string): Promise<Clip> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  return decodeToClip(await res.arrayBuffer());
}

export type Playback = {
  stop: () => void;
  /** Where playback is now, in seconds into the clip. */
  position: () => number;
};

/** Plays [start, end) of a clip. */
export function playClip(clip: Clip, start: number, end: number, onEnded: () => void): Playback {
  const context = editContext();
  void context.resume();
  const buffer = context.createBuffer(1, clip.samples.length || 1, clip.sampleRate);
  buffer.copyToChannel(new Float32Array(clip.samples), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = onEnded;
  const from = Math.max(0, start);
  const startedAt = context.currentTime;
  source.start(0, from, Math.max(0, end - start));
  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        // already ended
      }
    },
    position: () => Math.min(end, from + (context.currentTime - startedAt)),
  };
}
