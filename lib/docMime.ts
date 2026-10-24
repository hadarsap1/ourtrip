// Works out a document's real content type from its bytes.
//
// The browser's File.type is not reliable on phones: a file picked through
// Android's file chooser (Drive, WhatsApp, some galleries) often arrives with
// an empty type, which Storage then serves as application/octet-stream, and a
// locked copy kept that in enc_mime. Such a blob opens as an "unknown" file
// with no extension. The first bytes of every format we accept are fixed, so
// read them instead of trusting the label.

const GENERIC = new Set(["", "application/octet-stream", "binary/octet-stream"]);

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/tiff": "tiff",
  "application/octet-stream": "bin",
};

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

/** The type named by the file's own header, or null when it is not one we know. */
export async function sniffMime(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  const bytes = head.subarray(0, 16);
  // Readers accept the PDF header anywhere in the first 1KB (scanner apps
  // sometimes put a BOM or junk before it).
  if (ascii(head, 0, head.length).includes("%PDF-")) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return "image/tiff";
  }
  return null;
}

/** The best content type for a blob: its header first, then its own label. */
export async function resolveMime(blob: Blob, hint?: string | null): Promise<string> {
  const sniffed = await sniffMime(blob);
  if (sniffed) return sniffed;
  if (!GENERIC.has(blob.type)) return blob.type;
  if (hint && !GENERIC.has(hint)) return hint;
  return "application/octet-stream";
}

/** The same bytes, labelled with their real type. */
export async function withRealMime(blob: Blob, hint?: string | null): Promise<Blob> {
  const mime = await resolveMime(blob, hint);
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}

/** File extension for a content type ("bin" when unknown). */
export function extensionFor(mime: string): string {
  return EXT[mime] ?? (mime.split("/")[1] || "bin").replace("jpeg", "jpg");
}

/** A file name the phone's viewer recognises: the title plus the right extension. */
export function documentFileName(title: string, mime: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").trim() || "document";
  return `${base}.${extensionFor(mime)}`;
}
