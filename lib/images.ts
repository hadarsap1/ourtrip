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
