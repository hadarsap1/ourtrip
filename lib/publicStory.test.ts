import { describe, expect, it } from "vitest";
import { excerpt, isValidSlug, loadPublicStory } from "./publicStory";

describe("isValidSlug", () => {
  it("accepts only the 12-hex slugs posts_guard mints", () => {
    expect(isValidSlug("a1b2c3d4e5f6")).toBe(true);
    expect(isValidSlug("A1B2C3D4E5F6")).toBe(false);
    expect(isValidSlug("a1b2c3d4e5f6&select=*")).toBe(false);
    expect(isValidSlug("short")).toBe(false);
  });
});

describe("loadPublicStory", () => {
  it("never queries with an invalid slug", async () => {
    expect(await loadPublicStory("../../etc")).toBeNull();
  });
});

describe("excerpt", () => {
  it("flattens whitespace and cuts at a word", () => {
    expect(excerpt("שורה\n\nשנייה")).toBe("שורה שנייה");
    const long = excerpt("מילה ".repeat(60), 40);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(41);
  });
});
