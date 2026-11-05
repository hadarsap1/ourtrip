import { describe, expect, it } from "vitest";
import { exifDateFromJpeg, exifDateToISO } from "./exifDate";

// A minimal JPEG: SOI, APP1 Exif with IFD0 (DateTime + Exif pointer) and an
// Exif sub-IFD (DateTimeOriginal), then SOS.
function jpeg({ little, original, plain }: { little: boolean; original?: string; plain?: string }): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  // TIFF layout: header(8) | IFD0 | ExifIFD | strings
  const ifd0Entries = (plain ? 1 : 0) + (original ? 1 : 0);
  const ifd0 = 8;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifIfd = ifd0 + ifd0Size;
  const exifSize = original ? 2 + 12 + 4 : 0;
  let strings = exifIfd + exifSize;
  const tiff: number[] = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0)];
  const tail: number[] = [];
  tiff.push(...u16(ifd0Entries));
  if (plain) {
    tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(strings));
    tail.push(...str(plain.padEnd(19)));
    strings += 20;
  }
  if (original) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd));
  tiff.push(...u32(0));
  if (original) {
    tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(strings), ...u32(0));
    tail.push(...str(original.padEnd(19)));
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, ...tail];
  bytes.push(0xff, 0xd8, 0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif, 0xff, 0xda, 0, 2);
  return new Uint8Array(bytes).buffer;
}

describe("exifDateToISO", () => {
  it("takes the date part", () => expect(exifDateToISO("2026:11:02 18:04:11")).toBe("2026-11-02"));
  it("refuses a date that does not exist", () => expect(exifDateToISO("2026:02:30 10:00:00")).toBeNull());
  it("refuses an empty camera clock", () => expect(exifDateToISO("0000:00:00 00:00:00")).toBeNull());
  it("refuses junk", () => expect(exifDateToISO("yesterday")).toBeNull());
});

describe("exifDateFromJpeg", () => {
  it("reads DateTimeOriginal, little endian", () =>
    expect(exifDateFromJpeg(jpeg({ little: true, original: "2026:11:01 09:30:00", plain: "2026:11:04 12:00:00" }))).toBe(
      "2026-11-01"
    ));
  it("reads DateTimeOriginal, big endian", () =>
    expect(exifDateFromJpeg(jpeg({ little: false, original: "2026:10:31 21:15:00" }))).toBe("2026-10-31"));
  it("falls back to DateTime", () =>
    expect(exifDateFromJpeg(jpeg({ little: true, plain: "2026:10:29 08:00:00" }))).toBe("2026-10-29"));
  it("null without EXIF", () => expect(exifDateFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull());
  it("null for a file that is not a JPEG", () => expect(exifDateFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull());
  it("null for a cut-off file, never throws", () => {
    const full = new Uint8Array(jpeg({ little: true, original: "2026:11:01 09:30:00" }));
    expect(exifDateFromJpeg(full.slice(0, 30).buffer)).toBeNull();
  });
});
