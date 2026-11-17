// Short videos in an update (00099, Hadar 17/11/2026).
//
// The project is on Supabase's Free plan: 50 MB per file and 1 GB in all. A
// phone's minute of 1080p is 100-130 MB, so a video is re-encoded on the
// device before it is uploaded: H.264 in MP4, 720p, about 1.5 Mbit/s - a
// minute comes to roughly 12 MB and plays on every phone a guest might own.
//
// The browser can decode and encode video by itself (WebCodecs) but has no
// way to write an MP4 file; that is the one job of the `mediabunny` library
// (no wasm, loaded only when a video is picked).
//
// A device that cannot encode (an old browser) may still upload a file that
// is already small enough, as it is.

/** "Short": up to a minute. The database checks the same (00099). */
export const MAX_VIDEO_SECONDS = 60;
/** The `photos` bucket's limit per file (00099) - the Free plan's ceiling. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const LONG_EDGE = 1280;
const VIDEO_BITRATE = 1_500_000;
const FRAME_RATE = 30;
const POSTER_EDGE = 1280;
/** A phone's clock says 60.03 for "a minute". */
const LENGTH_SLACK = 0.5;

/** Types the bucket takes for a file uploaded as it is (00099). */
const AS_IS_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export type VideoProblem = "too_long" | "too_big" | "unreadable";

export class VideoError extends Error {
  constructor(readonly problem: VideoProblem) {
    super(problem);
    this.name = "VideoError";
  }
}

export type PreparedVideo = {
  blob: Blob;
  contentType: string;
  /** file extension without the dot */
  ext: string;
  /** JPEG of a frame near the start - what every thumbnail shows */
  poster: Blob;
  durationSeconds: number;
};

export function isVideoFile(file: { type: string }): boolean {
  return file.type.startsWith("video/");
}

export function isTooLong(seconds: number): boolean {
  return seconds > MAX_VIDEO_SECONDS + LENGTH_SLACK;
}

/**
 * The size to encode at: the long edge down to 720p's 1280, never up, the
 * shape kept, both sides even (H.264 takes no odd sizes).
 */
export function outputSize(width: number, height: number, longEdge = LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** How a file that cannot be re-encoded here goes up: as it is, if the
 *  bucket takes its type and size; otherwise why not. */
export function asIsUpload(file: { type: string; size: number }): { ext: string } | VideoProblem {
  const ext = AS_IS_TYPES[file.type];
  if (!ext) return "unreadable";
  if (file.size > MAX_VIDEO_BYTES) return "too_big";
  return { ext };
}

/**
 * The day a video is from: the file's own date when it is a real past day
 * (a phone's gallery keeps the day it was filmed), else today. Never a day
 * ahead - a photo's day is its place in the trip (00084).
 */
export function videoDay(lastModified: number, today: string): string {
  if (!Number.isFinite(lastModified) || lastModified <= 0) return today;
  const d = new Date(lastModified);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return iso <= today && iso >= "2020-01-01" ? iso : today;
}

function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.8);
  });
}

/** A plain dark frame: a video always has a poster, so every thumbnail and
 *  grid that shows photos shows it too. */
async function blankPoster(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvasToJpeg(canvas);
}

function waitFor(target: HTMLVideoElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), ms);
    target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    target.addEventListener("error", () => { clearTimeout(timer); reject(new Error("video error")); }, { once: true });
  });
}

/** Length and a frame through a <video> element - for a device that has no
 *  WebCodecs. Either may be missing if the browser cannot play the file. */
async function probeWithElement(file: Blob): Promise<{ durationSeconds: number | null; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    video.src = url;
    video.load();
    await waitFor(video, "loadedmetadata", 8000);
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
    let poster: Blob | null = null;
    try {
      // a little in: the very first frame is often black
      video.currentTime = Math.min(0.5, (durationSeconds ?? 0) / 2);
      await waitFor(video, "seeked", 8000);
      if (video.videoWidth && video.videoHeight) {
        const size = outputSize(video.videoWidth, video.videoHeight, POSTER_EDGE);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext("2d")?.drawImage(video, 0, 0, size.width, size.height);
        poster = await canvasToJpeg(canvas);
      }
    } catch {
      // no frame: the caller falls back to a plain poster
    }
    return { durationSeconds, poster };
  } catch {
    return { durationSeconds: null, poster: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** The file as it is, for a device that cannot re-encode it. */
async function prepareAsIs(file: File): Promise<PreparedVideo> {
  const how = asIsUpload(file);
  if (typeof how === "string") throw new VideoError(how);
  const probe = await probeWithElement(file);
  // a file whose length nobody can read cannot be held to "up to a minute"
  if (probe.durationSeconds === null) throw new VideoError("unreadable");
  if (isTooLong(probe.durationSeconds)) throw new VideoError("too_long");
  return {
    blob: file,
    contentType: file.type,
    ext: how.ext,
    poster: probe.poster ?? (await blankPoster()),
    durationSeconds: probe.durationSeconds,
  };
}

/**
 * Checks a picked video and makes it ready to upload: length checked, shrunk
 * to 720p H.264 MP4, a poster frame taken. `onProgress` gets 0..1 while it
 * encodes. Throws VideoError with what to tell the user.
 */
export async function prepareVideo(file: File, onProgress?: (fraction: number) => void): Promise<PreparedVideo> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return prepareAsIs(file);

  const { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, Conversion, Input, Mp4OutputFormat, Output, canEncodeVideo } =
    await import("mediabunny");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    let track;
    let durationSeconds: number;
    try {
      track = await input.getPrimaryVideoTrack();
      durationSeconds = await input.computeDuration();
    } catch {
      throw new VideoError("unreadable");
    }
    if (!track) throw new VideoError("unreadable");
    // before any encoding: a ten-minute video is refused at once
    if (isTooLong(durationSeconds)) throw new VideoError("too_long");

    const size = outputSize(track.displayWidth, track.displayHeight);
    const canConvert =
      (await track.canDecode().catch(() => false)) &&
      (await canEncodeVideo("avc", { width: size.width, height: size.height, bitrate: VIDEO_BITRATE }).catch(() => false));
    if (!canConvert) return await prepareAsIs(file);

    let poster: Blob | null = null;
    try {
      const posterSize = outputSize(track.displayWidth, track.displayHeight, POSTER_EDGE);
      const sink = new CanvasSink(track, { width: posterSize.width, height: posterSize.height, fit: "fill" });
      const first = await track.getFirstTimestamp();
      // a little in: the very first frame is often black
      const frame = await sink.getCanvas(first + Math.min(0.5, durationSeconds / 2));
      if (frame) poster = await canvasToJpeg(frame.canvas);
    } catch {
      // no frame: a plain poster below
    }

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    let conversion;
    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        video: {
          width: size.width,
          height: size.height,
          fit: "fill",
          codec: "avc",
          bitrate: VIDEO_BITRATE,
          frameRate: FRAME_RATE,
          forceTranscode: true,
        },
        // the sound is left as the phone recorded it when MP4 can carry it
        // (AAC, a megabyte or two a minute); re-encoded only when it cannot
        showWarnings: false,
      });
    } catch {
      return await prepareAsIs(file);
    }
    // the sound must not go missing silently (a codec this browser cannot
    // carry over): then the file goes up as it is, or not at all
    const sound = await input.getPrimaryAudioTrack().catch(() => null);
    const used = (t: { id: number }) => conversion.utilizedTracks.some((u) => u.id === t.id);
    if (!conversion.isValid || !used(track) || (sound && !used(sound))) return await prepareAsIs(file);

    conversion.onProgress = (fraction) => onProgress?.(Math.max(0, Math.min(1, fraction)));
    try {
      await conversion.execute();
    } catch {
      return await prepareAsIs(file);
    }
    if (!target.buffer) return await prepareAsIs(file);
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (blob.size > MAX_VIDEO_BYTES) throw new VideoError("too_big");
    return {
      blob,
      contentType: "video/mp4",
      ext: "mp4",
      poster: poster ?? (await blankPoster()),
      durationSeconds,
    };
  } finally {
    input.dispose();
  }
}
