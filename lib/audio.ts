// Recording helpers for the kids' podcast (migration 00044). Pure, so the
// format choice can be tested without a microphone.

/** DESIGN-sharing §2: short episodes; also keeps a file to a few MB. */
export const MAX_EPISODE_SECONDS = 7 * 60;

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
