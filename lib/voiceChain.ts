// Browser-only: the live voice chain the recorder puts between the
// microphone and MediaRecorder (24/11/2026, DECISIONS #75). Processing while
// recording, not after, keeps the take a compressed AAC file at the
// microphone's full rate - processing afterwards would mean a WAV at
// EDIT_SAMPLE_RATE, bigger and with less top end. Settings: voiceChainSettings
// in lib/audio.ts.

import { voiceChainSettings } from "@/lib/audio";

export type VoiceChain = { stream: MediaStream; close: () => void };

/**
 * Builds the chain on a fresh AudioContext. Call it inside the tap that
 * starts the take (before any await), so iOS lets the context run. Returns
 * null when the browser cannot - the caller then records the raw microphone.
 */
export function startVoiceContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx({ latencyHint: "playback" });
    void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export async function connectVoiceChain(
  ctx: AudioContext,
  mic: MediaStream,
  externalMics: boolean
): Promise<VoiceChain | null> {
  try {
    if (ctx.state !== "running") await ctx.resume();
    // a context that will not run would record silence: use the raw mic instead
    if (ctx.state !== "running") return null;
    const settings = voiceChainSettings(externalMics);
    let node: AudioNode = ctx.createMediaStreamSource(mic);
    for (const f of settings.filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.frequency;
      filter.gain.value = f.gain;
      filter.Q.value = f.Q;
      node.connect(filter);
      node = filter;
    }
    if (settings.compressor) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = settings.compressor.threshold;
      c.knee.value = settings.compressor.knee;
      c.ratio.value = settings.compressor.ratio;
      c.attack.value = settings.compressor.attack;
      c.release.value = settings.compressor.release;
      node.connect(c);
      node = c;
    }
    const out = ctx.createMediaStreamDestination();
    out.channelCount = 1;
    node.connect(out);
    return { stream: out.stream, close: () => void ctx.close().catch(() => {}) };
  } catch {
    return null;
  }
}
