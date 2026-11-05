// The day a photo was taken, from its JPEG EXIF (Hadar 05/11/2026): a photo
// from Hanoi uploaded later in Ninh Binh landed on the Ninh Binh day, because
// taken_on was the upload day. No library: a JPEG's EXIF is a short walk.
//
// Reads DateTimeOriginal (0x9003) from the Exif sub-IFD, else DateTime
// (0x0132) from IFD0. Camera time is local to where the photo was taken, so
// its date part is the trip day. Anything unreadable gives null and the
// caller keeps the upload day. WhatsApp and screenshots usually have no EXIF.

const DATE_TIME = 0x0132;
const EXIF_IFD = 0x8769;
const DATE_TIME_ORIGINAL = 0x9003;

/** "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DD", or null if it is not a real date. */
export function exifDateToISO(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    Number(y) < 1990 ||
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** The EXIF date of a JPEG's bytes, or null. Never throws. */
export function exifDateFromJpeg(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // start of scan: no EXIF
      const size = view.getUint16(offset + 2);
      // APP1 holding "Exif\0\0"
      if (marker === 0xffe1 && size >= 8 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
        return readTiff(view, offset + 10);
      }
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

function readTiff(view: DataView, tiff: number): string | null {
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  const entries = (ifd: number) => {
    const count = u16(ifd);
    const out: { tag: number; type: number; count: number; value: number }[] = [];
    for (let i = 0; i < count; i++) {
      const at = ifd + 2 + i * 12;
      out.push({ tag: u16(at), type: u16(at + 2), count: u32(at + 4), value: at + 8 });
    }
    return out;
  };
  const ascii = (e: { type: number; count: number; value: number }) => {
    if (e.type !== 2 || e.count < 10) return null;
    const start = e.count > 4 ? tiff + u32(e.value) : e.value;
    let s = "";
    for (let i = 0; i < Math.min(e.count, 20); i++) {
      const c = view.getUint8(start + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return exifDateToISO(s);
  };

  const ifd0 = entries(tiff + u32(tiff + 4));
  const exifPointer = ifd0.find((e) => e.tag === EXIF_IFD);
  if (exifPointer) {
    const original = entries(tiff + u32(exifPointer.value)).find((e) => e.tag === DATE_TIME_ORIGINAL);
    const date = original ? ascii(original) : null;
    if (date) return date;
  }
  const plain = ifd0.find((e) => e.tag === DATE_TIME);
  return plain ? ascii(plain) : null;
}

/** The day a picked file was taken, from its EXIF; null when unknown. */
export async function photoTakenOn(file: Blob): Promise<string | null> {
  try {
    // EXIF sits at the start of the file; 256KB covers it with a thumbnail
    return exifDateFromJpeg(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return null;
  }
}
