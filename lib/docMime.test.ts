import { describe, expect, it } from "vitest";
import { documentFileName, resolveMime, sniffMime, withRealMime } from "@/lib/docMime";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const text = (s: string) => new TextEncoder().encode(s.padEnd(16, "\0"));

describe("sniffMime", () => {
  it("knows the formats the vault accepts", async () => {
    expect(await sniffMime(new Blob([text("%PDF-1.7")]))).toBe("application/pdf");
    expect(await sniffMime(new Blob([bytes(0xff, 0xd8, 0xff, 0xe0)]))).toBe("image/jpeg");
    expect(await sniffMime(new Blob([bytes(0x89, 0x50, 0x4e, 0x47)]))).toBe("image/png");
    expect(await sniffMime(new Blob([text("RIFF\0\0\0\0WEBP")]))).toBe("image/webp");
    expect(await sniffMime(new Blob([text("\0\0\0\x18ftypheic")]))).toBe("image/heic");
  });

  it("returns null for anything else", async () => {
    expect(await sniffMime(new Blob([text("hello")]))).toBeNull();
  });
});

describe("resolveMime", () => {
  it("fixes the empty type phones hand over", async () => {
    const blob = new Blob([text("%PDF-1.4")], { type: "" });
    expect(await resolveMime(blob)).toBe("application/pdf");
    expect((await withRealMime(blob)).type).toBe("application/pdf");
  });

  it("trusts the bytes over a generic label", async () => {
    const blob = new Blob([bytes(0xff, 0xd8, 0xff)], { type: "application/octet-stream" });
    expect(await resolveMime(blob)).toBe("image/jpeg");
  });

  it("falls back to a specific hint when the bytes are unknown", async () => {
    const blob = new Blob([text("plain")], { type: "application/octet-stream" });
    expect(await resolveMime(blob, "text/plain")).toBe("text/plain");
    expect(await resolveMime(blob)).toBe("application/octet-stream");
  });
});

describe("documentFileName", () => {
  it("adds the extension a phone viewer needs", () => {
    expect(documentFileName("דרכון הדר", "application/pdf")).toBe("דרכון הדר.pdf");
    expect(documentFileName("visa/usa", "image/jpeg")).toBe("visa_usa.jpg");
    expect(documentFileName("x", "application/octet-stream")).toBe("x.bin");
  });
});

describe("sniffMime - phone formats", () => {
  it("finds a PDF header after leading junk", async () => {
    const blob = new Blob([new TextEncoder().encode("﻿\r\n%PDF-1.5")]);
    expect(await sniffMime(blob)).toBe("application/pdf");
  });

  it("knows AVIF and HEVC-branded HEIC", async () => {
    expect(await sniffMime(new Blob([text("\0\0\0\x1cftypavif")]))).toBe("image/avif");
    expect(await sniffMime(new Blob([text("\0\0\0\x1cftyphevc")]))).toBe("image/heic");
  });
});
