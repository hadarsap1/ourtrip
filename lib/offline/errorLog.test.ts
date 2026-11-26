import { describe, expect, it } from "vitest";
import { formatErrorLog, toLogEntry } from "./errorLog";

describe("toLogEntry", () => {
  it("keeps the first stack lines, the digest and the boundary", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    err.stack = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const e = toLogEntry(err, "screen", new Date("2026-11-25T10:00:00Z"));
    expect(e.message).toBe("boom");
    expect(e.digest).toBe("abc123");
    expect(e.boundary).toBe("screen");
    expect(e.at).toBe("2026-11-25T10:00:00.000Z");
    expect(e.stack?.split("\n")).toHaveLength(8);
  });

  it("caps a long message", () => {
    const e = toLogEntry(new Error("x".repeat(2000)), "root");
    expect(e.message).toHaveLength(500);
    expect(e.digest).toBeNull();
  });
});

describe("formatErrorLog", () => {
  it("marks offline crashes and separates entries", () => {
    const text = formatErrorLog([
      { at: "t1", path: "/a", message: "m1", digest: null, stack: null, online: false, boundary: "screen" },
      { at: "t2", path: "/b", message: "m2", digest: "d", stack: "s", online: true, boundary: "root" },
    ]);
    expect(text).toContain("/a (offline)");
    expect(text).toContain("digest d");
    expect(text.split("\n\n")).toHaveLength(2);
  });
});
