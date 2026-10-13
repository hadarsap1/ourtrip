import { describe, expect, it } from "vitest";
import { baseMime, episodeNumbers, extensionFor, formatClock, pickRecordingMime, roundMinutes } from "./audio";

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
