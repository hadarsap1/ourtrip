import { describe, expect, it } from "vitest";
import {
  appendClip,
  cutRange,
  durationOf,
  EDIT_SAMPLE_RATE,
  encodeWav,
  keepRange,
  measureLoudness,
  normalizeLoudness,
  NORMALIZE_MAX_GAIN,
  NORMALIZE_PEAK,
  TARGET_LOUDNESS_DB,
  peaks,
  shortenSilences,
  toMono,
  undoDepthFor,
  type Clip,
} from "./audioEdit";
import { MAX_EPISODE_SECONDS } from "./audio";

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

describe("EDIT_SAMPLE_RATE", () => {
  it("keeps the air of a child's voice (up to 16 kHz) and a 20-minute WAV under the 80 MB bucket limit", () => {
    expect(EDIT_SAMPLE_RATE / 2).toBeGreaterThanOrEqual(16_000);
    const wavBytes = 44 + EDIT_SAMPLE_RATE * 2 * MAX_EPISODE_SECONDS;
    expect(wavBytes).toBeLessThan(80 * 1024 * 1024);
  });
});

/** A sine of `amplitude` for `seconds`, at 8 kHz. */
function tone(amplitude: number, seconds: number, rate = 8000): Clip {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / rate);
  return { samples, sampleRate: rate };
}

describe("measureLoudness", () => {
  it("reads a full-scale sine at about -3 dB and silence as -Infinity", () => {
    expect(measureLoudness(tone(1, 2))).toBeCloseTo(-3.01, 1);
    expect(measureLoudness({ samples: new Float32Array(16000), sampleRate: 8000 })).toBe(-Infinity);
  });
  it("is not pulled down by pauses between sentences", () => {
    const talk = tone(0.1, 2);
    const withPause = appendClip(appendClip(talk, { samples: new Float32Array(16000), sampleRate: 8000 }, 0), talk, 0);
    expect(measureLoudness(withPause)).toBeCloseTo(measureLoudness(talk), 0);
  });
});

describe("normalizeLoudness", () => {
  it("brings a quiet take to the target loudness", () => {
    const out = normalizeLoudness(tone(0.05, 2));
    expect(measureLoudness(out)).toBeCloseTo(TARGET_LOUDNESS_DB, 0);
    expect(out.sampleRate).toBe(8000);
  });
  it("is not set by one bump: the talking still reaches the target and no sample passes -1 dBFS", () => {
    const clip = tone(0.05, 3);
    clip.samples[12000] = 0.99; // a knock on the mic
    const out = normalizeLoudness(clip);
    expect(measureLoudness(out)).toBeCloseTo(TARGET_LOUDNESS_DB, 0);
    let peak = 0;
    for (const v of out.samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(NORMALIZE_PEAK + 1e-6);
  });
  it("caps the gain so a near-silent take does not become hiss", () => {
    const out = normalizeLoudness(tone(0.0005, 2));
    expect(Math.max(...out.samples)).toBeCloseTo(0.0005 * NORMALIZE_MAX_GAIN, 4);
  });
  it("leaves silence and an already-even take alone", () => {
    const silent = { samples: new Float32Array(16000), sampleRate: 8000 };
    expect(normalizeLoudness(silent)).toBe(silent);
    const even = normalizeLoudness(tone(0.05, 2));
    expect(normalizeLoudness(even)).toBe(even);
  });
});

describe("undoDepthFor", () => {
  it("keeps three steps for a short episode and one for a 20-minute one", () => {
    expect(undoDepthFor(EDIT_SAMPLE_RATE * 60 * 3)).toBe(3);
    expect(undoDepthFor(EDIT_SAMPLE_RATE * 60 * 20)).toBe(1);
    expect(undoDepthFor(0)).toBe(3);
  });
});

describe("shortenSilences", () => {
  const rate = 1000; // 20-sample frames
  const voice = (seconds: number) => Array.from({ length: seconds * rate }, (_, i) => (i % 2 ? 0.5 : -0.5));
  const quiet = (seconds: number, level = 0) => Array.from({ length: seconds * rate }, (_, i) => (i % 2 ? level : -level));
  const make = (...parts: number[][]): Clip => ({ samples: Float32Array.from(parts.flat()), sampleRate: rate });

  it("shortens a long pause between words to half a second", () => {
    const { clip: out, removedSeconds } = shortenSilences(make(voice(1), quiet(2), voice(1)));
    expect(removedSeconds).toBeCloseTo(1.5);
    expect(durationOf(out)).toBeCloseTo(2.5);
  });

  it("leaves short pauses alone", () => {
    const input = make(voice(1), quiet(0.5), voice(1));
    const { clip: out, removedSeconds } = shortenSilences(input);
    expect(removedSeconds).toBe(0);
    expect(out).toBe(input);
  });

  it("trims the opening and closing pauses to a quarter second each", () => {
    const { clip: out } = shortenSilences(make(quiet(1), voice(1), quiet(1), voice(1), quiet(3)));
    expect(durationOf(out)).toBeCloseTo(0.25 + 1 + 0.5 + 1 + 0.25);
  });

  it("treats background hum as quiet, judged against this recording", () => {
    const { removedSeconds } = shortenSilences(make(voice(1), quiet(2, 0.02), voice(1)));
    expect(removedSeconds).toBeCloseTo(1.5);
  });

  it("does nothing to an all-quiet take", () => {
    expect(shortenSilences(make(quiet(3, 0.001))).removedSeconds).toBe(0);
  });

  it("fades the join instead of clicking", () => {
    const { clip: out } = shortenSilences(make(voice(1), quiet(2, 0.02), voice(1)));
    // the cut sits mid-pause at 1.25s: the hum there fades to nothing...
    expect(out.samples[1250]).toBeCloseTo(0);
    expect(Math.abs(out.samples[1249])).toBeLessThan(0.02);
    // ...and the words on either side are untouched
    expect(Math.abs(out.samples[999])).toBeCloseTo(0.5);
    expect(Math.abs(out.samples[1500])).toBeCloseTo(0.5);
  });
});
