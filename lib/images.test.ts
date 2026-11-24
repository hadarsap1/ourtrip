import { describe, expect, it } from "vitest";
import { thumbPathFor } from "./images";

describe("thumbPathFor", () => {
  it("puts a photo's thumbnail next to it", () => {
    expect(thumbPathFor("trip-1/abc.jpg")).toBe("trip-1/abc.thumb.jpg");
  });
  it("names a video's thumbnail after the video, not the poster", () => {
    expect(thumbPathFor("trip-1/abc.poster.jpg")).toBe("trip-1/abc.thumb.jpg");
  });
  it("never returns the picture's own path (no overwrite)", () => {
    for (const p of ["t/a.jpg", "t/a.poster.jpg", "t/a.png"]) expect(thumbPathFor(p)).not.toBe(p);
  });
});
