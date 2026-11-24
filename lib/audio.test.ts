import { describe, expect, it } from "vitest";
import {
  baseMime,
  episodeNumbers,
  extensionFor,
  formatClock,
  isLowRateInput,
  MAX_EPISODE_SECONDS,
  micConstraints,
  pickRecordingMime,
  RECORDING_BITRATE,
  roundMinutes,
  voiceChainSettings,
} from "./audio";

describe("pickRecordingMime", () => {
  it("prefers AAC/MP4 when the browser can record it", () => {
    expect(pickRecordingMime(() => true)).toBe("audio/mp4;codecs=mp4a.40.2");
  });
  it("falls back to WebM/Opus (older Android Chrome)", () => {
    expect(pickRecordingMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
  });
  it("returns null when nothing is supported, and survives a throwing check", () => {
    expect(pickRecordingMime(() => false)).toBeNull();
    expect(
      pickRecordingMime(() => {
        throw new Error("unknown");
      })
    ).toBeNull();
  });
});

describe("baseMime / extensionFor", () => {
  it("strips codecs and maps to a file extension", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(extensionFor("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
    expect(extensionFor("audio/webm")).toBe("webm");
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
    // a take the recorder stitched together after an interruption
    expect(extensionFor("audio/wav")).toBe("wav");
  });
});

describe("formatClock / roundMinutes", () => {
  it("formats a running timer", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75.9)).toBe("1:15");
    expect(formatClock(-3)).toBe("0:00");
  });
  it("rounds to whole minutes, at least one", () => {
    expect(roundMinutes(20)).toBe(1);
    expect(roundMinutes(150)).toBe(3);
    expect(roundMinutes(null)).toBeNull();
    expect(roundMinutes(0)).toBeNull();
  });
});

describe("episodeNumbers", () => {
  it("numbers approved episodes in recording order, skipping the rest", () => {
    const numbers = episodeNumbers([
      { id: "b", status: "approved", created_at: "2026-11-03" },
      { id: "p", status: "pending", created_at: "2026-11-02" },
      { id: "a", status: "approved", created_at: "2026-11-01" },
    ]);
    expect(numbers.get("a")).toBe(1);
    expect(numbers.get("b")).toBe(2);
    expect(numbers.has("p")).toBe(false);
  });
});

describe("micConstraints", () => {
  it("records raw with external mics", () => {
    expect(micConstraints(true)).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });
  it("brings back noise suppression and auto gain for the phone's own mic, never echo cancellation", () => {
    expect(micConstraints(false)).toEqual({ echoCancellation: false, noiseSuppression: true, autoGainControl: true });
  });
});

describe("voiceChainSettings", () => {
  it("external mics: rumble cut, less chest boom, more presence and air, gentle compression", () => {
    const { filters, compressor } = voiceChainSettings(true);
    expect(filters[0]).toMatchObject({ type: "highpass", frequency: 80 });
    expect(filters.find((f) => f.frequency === 300)?.gain).toBeLessThan(0);
    expect(filters.find((f) => f.frequency === 4000)?.gain).toBeGreaterThan(0);
    expect(filters.find((f) => f.type === "highshelf")?.gain).toBeGreaterThan(0);
    expect(compressor?.ratio).toBeGreaterThan(1);
    expect(compressor?.ratio).toBeLessThanOrEqual(4);
  });
  it("phone mic: light touch, no compressor on top of the phone's auto gain", () => {
    const { filters, compressor } = voiceChainSettings(false);
    expect(compressor).toBeNull();
    expect(filters[0].type).toBe("highpass");
  });
});

describe("isLowRateInput / RECORDING_BITRATE", () => {
  it("flags a voice-call rate and ignores full rates or no report", () => {
    expect(isLowRateInput(16000)).toBe(true);
    expect(isLowRateInput(48000)).toBe(false);
    expect(isLowRateInput(44100)).toBe(false);
    expect(isLowRateInput(undefined)).toBe(false);
  });
  it("a 20-minute take stays well under the bucket limit", () => {
    expect((RECORDING_BITRATE / 8) * MAX_EPISODE_SECONDS).toBeLessThan(25 * 1024 * 1024);
  });
});
