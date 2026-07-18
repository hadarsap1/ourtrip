import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./links";

describe("normalizeUrl", () => {
  it("leaves absolute URLs untouched", () => {
    expect(normalizeUrl("https://facebook.com/x")).toBe("https://facebook.com/x");
    expect(normalizeUrl("http://a.com")).toBe("http://a.com");
  });

  it("prefixes https:// for bare hosts", () => {
    expect(normalizeUrl("facebook.com/post/123")).toBe("https://facebook.com/post/123");
    expect(normalizeUrl("  example.org  ")).toBe("https://example.org");
  });

  it("keeps an empty string empty", () => {
    expect(normalizeUrl("   ")).toBe("");
  });
});
