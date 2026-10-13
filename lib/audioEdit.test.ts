import { describe, expect, it } from "vitest";
import {
  appendClip,
  cutRange,
  durationOf,
  encodeWav,
  keepRange,
  peaks,
  toMono,
  undoDepthFor,
  type Clip,
} from "./audioEdit";

// 10 samples per second makes the arithmetic readable
const clip = (values: number[]): Clip => ({ samples: Float32Array.from(values), sampleRate: 10 });
const ramp = clip(Array.from({ length: 30 }, (_, i) => i / 100)); // 3 seconds

describe("keepRange", () => {
  it("keeps the selected seconds, in either handle order", () => {
    const kept = keepRange(ramp, 2, 1);
    expect(durationOf(kept)).toBe(1);
    expect(kept.samples[0]).toBeCloseTo(0.1);
  });
  it("clamps a selection past the end", () => {
    expect(durationOf(keepRange(ramp, 2.5, 99))).toBeCloseTo(0.5);
  });
});

describe("cutRange", () => {
  it("removes the middle and joins the two sides", () => {
    const out = cutRange(ramp, 1, 2);
    expect(durationOf(out)).toBe(2);
    expect(out.samples[9]).toBeCloseTo(0.09);
    expect(out.samples[10]).toBeCloseTo(0.2);
  });
  it("cutting everything leaves silence of zero length", () => {
    expect(cutRange(ramp, 0, 3).samples.length).toBe(0);
  });
});

describe("appendClip", () => {
  it("puts the new take after a short pause", () => {
    const out = appendClip(clip([1, 1]), clip([0.5]), 0.3);
    expect(Array.from(out.samples)).toEqual([1, 1, 0, 0, 0, 0.5]);
  });
  it("adds no pause to an empty episode", () => {
    expect(appendClip(clip([]), clip([0.5])).samples.length).toBe(1);
  });
  it("refuses mismatched sample rates", () => {
    expect(() => appendClip(clip([1]), { samples: new Float32Array(1), sampleRate: 16000 })).toThrow();
  });
});

describe("toMono / peaks", () => {
  it("averages channels", () => {
    expect(Array.from(toMono([Float32Array.from([1, 0]), Float32Array.from([0, 0])]))).toEqual([0.5, 0]);
  });
  it("draws the loudest point per bucket", () => {
    expect(peaks(Float32Array.from([0.1, -0.8, 0.2, 0.3]), 2)).toEqual([
      expect.closeTo(0.8),
      expect.closeTo(0.3),
    ]);
    expect(peaks(new Float32Array(0), 10)).toEqual([]);
  });
});

describe("encodeWav", () => {
  it("writes a mono 16-bit RIFF/WAVE header and clips out-of-range samples", async () => {
    const blob = encodeWav({ samples: Float32Array.from([0, 2, -2]), sampleRate: 16000 });
    expect(blob.type).toBe("audio/wav");
    const view = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(o + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});

describe("undoDepthFor", () => {
  it("keeps three steps for a short episode and one for a 20-minute one", () => {
    expect(undoDepthFor(16000 * 60 * 3)).toBe(3);
    expect(undoDepthFor(16000 * 60 * 20)).toBe(1);
    expect(undoDepthFor(0)).toBe(3);
  });
});
