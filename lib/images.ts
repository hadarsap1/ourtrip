// Client-side photo compression (DECISIONS #11): ~1600px long edge,
// ~300KB JPEG target. Runs before any upload so tablets on hotel wifi
// aren't pushing 8MB originals.

const MAX_DIMENSION = 1600;
const TARGET_BYTES = 350 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, 0.82);
  if (blob.size > TARGET_BYTES) {
    blob = await canvasToBlob(canvas, 0.68);
  }
  return blob;
}

// Thumbnails for grids (egress fix 24/11/2026): a 3-column grid on a phone
// shows a picture ~130 CSS px wide, ~400 device px. A full 1600px photo there
// cost ~10x the bytes for nothing visible. The short edge is sized so
// object-cover squares stay sharp.
const THUMB_SHORT_EDGE = 480;
const THUMB_QUALITY = 0.72;

/** A small JPEG of `source` (a photo or a video's poster) for grid tiles. */
export async function makeThumbnail(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, THUMB_SHORT_EDGE / Math.min(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas, THUMB_QUALITY);
}

/** Where a file's thumbnail lives: next to it, `<name>.thumb.jpg`. */
export function thumbPathFor(filePath: string): string {
  return filePath.replace(/(\.poster)?\.[^./]+$/, "") + ".thumb.jpg";
}
