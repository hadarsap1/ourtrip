// Recording helpers for the kids' podcast (migration 00044). Pure, so the
// format choice can be tested without a microphone.

/**
 * Longest episode, recorded or edited. Raised from 7 to 20 minutes (13/10).
 * Sizes at that length: a recording ~19 MB (128 kbps), an edited episode
 * ~77 MB (32 kHz WAV) - both under the audio bucket's 80 MB limit (00109).
 */
export const MAX_EPISODE_SECONDS = 20 * 60;

// Preference order. AAC in MP4 plays on every phone a grandparent might own,
// iPhones included; Chrome on Android records it in recent versions. WebM /
// Opus is what older Android Chrome offers, and plays in current browsers.
const CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/**
 * Microphone settings for a take (01/11/2026, DECISIONS #49). With external
 * mics (the family's wireless lav mics, the default) the raw input: the mics
 * clean up the voice themselves, and phone-call processing on top muffled it.
 * With the phone's own microphone the call processing comes back - noise
 * suppression for the street, auto gain for a child standing far away; echo
 * cancellation stays off, nothing plays while recording. The clarity chain
 * (voiceChainSettings, DECISIONS #75) works on what these settings let in.
 */
export function micConstraints(externalMics: boolean): MediaTrackConstraints {
  return externalMics
    ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    : { echoCancellation: false, noiseSuppression: true, autoGainControl: true };
}

/**
 * Take bitrate (24/11/2026, DECISIONS #75): 128 kbps AAC keeps the top of a
 * child's voice (ס ש צ) that 96 kbps smeared. A 20-minute take is ~19 MB.
 */
export const RECORDING_BITRATE = 128_000;

/** One filter of the live voice chain (lib/voiceChain.ts builds it). */
export type VoiceFilter = { type: BiquadFilterType; frequency: number; gain: number; Q: number };

export type VoiceChainSettings = {
  filters: VoiceFilter[];
  /** null = no compressor (the phone's own auto gain already evens the level) */
  compressor: { threshold: number; knee: number; ratio: number; attack: number; release: number } | null;
};

/**
 * The live voice chain applied while recording (24/11/2026, DECISIONS #75:
 * "still not clear", iPhone + wired-in USB-C lav mics). A lav clipped on the
 * chest sounds boomy and dull: the chest resonates around 200-400 Hz and the
 * mouth's consonants point away from it. So:
 *  - high-pass 80 Hz: handling noise, wind rumble, mains hum
 *  - -2 dB around 300 Hz: the chest "mud"
 *  - +2 dB around 4 kHz: presence, where words are understood
 *  - +1 dB shelf above 10 kHz: air, the ס ש צ of a child's voice
 * (halved on 24/11/2026 after the first try: "too sharp" - was -3/+4/+3)
 *  - a gentle compressor (3:1 from -24 dB): a whisper and a shout come out
 *    closer, so a listener does not ride the volume.
 * With the phone's own microphone iOS already filters and levels the call
 * path, so only the rumble cut and a light presence lift (+1 dB) remain.
 */
export function voiceChainSettings(externalMics: boolean): VoiceChainSettings {
  const highpass: VoiceFilter = { type: "highpass", frequency: 80, gain: 0, Q: 0.707 };
  if (!externalMics) {
    return {
      filters: [highpass, { type: "peaking", frequency: 4000, gain: 1, Q: 0.9 }],
      compressor: null,
    };
  }
  return {
    filters: [
      highpass,
      { type: "peaking", frequency: 300, gain: -2, Q: 1 },
      { type: "peaking", frequency: 4000, gain: 2, Q: 0.9 },
      { type: "highshelf", frequency: 10000, gain: 1, Q: 0.707 },
    ],
    compressor: { threshold: -24, knee: 10, ratio: 3, attack: 0.005, release: 0.2 },
  };
}

/**
 * True when the microphone reports a rate a voice call uses (Bluetooth
 * headsets run at 16 kHz on iPhone): everything above 8 kHz is gone before
 * the app sees it, and no processing can bring it back. Unknown = false.
 */
export function isLowRateInput(sampleRate: number | undefined): boolean {
  return typeof sampleRate === "number" && sampleRate > 0 && sampleRate < 44_100;
}

/** The first format this browser can record, or null if it records none. */
export function pickRecordingMime(isTypeSupported: (mime: string) => boolean): string | null {
  for (const mime of CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // some browsers throw for unknown strings instead of returning false
    }
  }
  return null;
}

/** "audio/webm;codecs=opus" → "audio/webm" (what storage and <audio> want). */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function extensionFor(mime: string): string {
  switch (baseMime(mime)) {
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/aac":
      return "aac";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "webm";
  }
}

/** 0 → "0:00", 75 → "1:15", 3600 → "60:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whole minutes for a list row, never "0". */
export function roundMinutes(seconds: number | null): number | null {
  if (seconds === null || seconds <= 0) return null;
  return Math.max(1, Math.round(seconds / 60));
}

/** Number approved episodes 1..n by when they were recorded. */
export function episodeNumbers<T extends { id: string; status: string; created_at: string }>(
  episodes: T[]
): Map<string, number> {
  const approved = episodes
    .filter((e) => e.status === "approved")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return new Map(approved.map((e, i) => [e.id, i + 1]));
}
