import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, asIsUpload, isTooLong, isVideoFile, outputSize, videoDay } from "./video";

describe("outputSize", () => {
  it("brings 1080p down to 720p, landscape and portrait", () => {
    expect(outputSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });
  it("brings 4K down to 720p", () => {
    expect(outputSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
  });
  it("never enlarges a small video", () => {
    expect(outputSize(640, 360)).toEqual({ width: 640, height: 360 });
  });
  it("keeps both sides even", () => {
    const size = outputSize(1919, 1079);
    expect(size.width % 2).toBe(0);
    expect(size.height % 2).toBe(0);
    expect(outputSize(853, 481)).toEqual({ width: 854, height: 482 });
  });
});

describe("isTooLong", () => {
  it("takes a minute, with the phone's rounding", () => {
    expect(isTooLong(12)).toBe(false);
    expect(isTooLong(60)).toBe(false);
    expect(isTooLong(60.3)).toBe(false);
  });
  it("refuses more than a minute", () => {
    expect(isTooLong(61)).toBe(true);
    expect(isTooLong(600)).toBe(true);
  });
});

describe("asIsUpload", () => {
  it("takes a small MP4, MOV or WebM as it is", () => {
    expect(asIsUpload({ type: "video/mp4", size: 8_000_000 })).toEqual({ ext: "mp4" });
    expect(asIsUpload({ type: "video/quicktime", size: 8_000_000 })).toEqual({ ext: "mov" });
    expect(asIsUpload({ type: "video/webm", size: 8_000_000 })).toEqual({ ext: "webm" });
  });
  it("refuses a file over the bucket's limit", () => {
    expect(asIsUpload({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toBe("too_big");
    expect(asIsUpload({ type: "video/mp4", size: MAX_VIDEO_BYTES })).toEqual({ ext: "mp4" });
  });
  it("refuses a type the bucket does not take", () => {
    expect(asIsUpload({ type: "video/x-matroska", size: 1000 })).toBe("unreadable");
    expect(asIsUpload({ type: "", size: 1000 })).toBe("unreadable");
  });
});

describe("isVideoFile", () => {
  it("tells a video from a photo", () => {
    expect(isVideoFile({ type: "video/mp4" })).toBe(true);
    expect(isVideoFile({ type: "image/jpeg" })).toBe(false);
    expect(isVideoFile({ type: "" })).toBe(false);
  });
});

describe("videoDay", () => {
  const today = "2026-11-17";
  it("keeps the day the file is from", () => {
    expect(videoDay(new Date(2026, 10, 14, 15, 30).getTime(), today)).toBe("2026-11-14");
  });
  it("never a day ahead", () => {
    expect(videoDay(new Date(2026, 10, 19).getTime(), today)).toBe(today);
  });
  it("falls back to today with no usable date", () => {
    expect(videoDay(0, today)).toBe(today);
    expect(videoDay(Number.NaN, today)).toBe(today);
    expect(videoDay(new Date(1999, 0, 1).getTime(), today)).toBe(today);
  });
});
