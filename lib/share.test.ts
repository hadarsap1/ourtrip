import { describe, expect, it } from "vitest";
import { shareText, shareUrl, whatsappUrl } from "./share";

describe("shareUrl", () => {
  it("sends a public story to its open page", () => {
    expect(
      shareUrl("https://trip.example/", { kind: "story", id: "s1", publicSlug: "abc123", isPublic: true })
    ).toBe("https://trip.example/s/abc123");
  });

  it("keeps a guests story inside the portal, even if it once had a slug", () => {
    expect(
      shareUrl("https://trip.example", { kind: "story", id: "s1", publicSlug: "abc123", isPublic: false })
    ).toBe("https://trip.example/stories#story-s1");
  });

  it("links an episode to its place in the podcast list", () => {
    expect(shareUrl("https://trip.example", { kind: "episode", id: "e9" })).toBe(
      "https://trip.example/podcast#episode-e9"
    );
  });
});

describe("shareText / whatsappUrl", () => {
  it("puts the title and link into the Hebrew line", () => {
    const text = shareText("episode", "  השוק הצף ", "https://x.test/podcast#episode-1");
    expect(text).toContain("השוק הצף");
    expect(text).toContain("https://x.test/podcast#episode-1");
    expect(text).toContain("סו-בב עולם!");
  });

  it("encodes the whole message for wa.me", () => {
    const url = whatsappUrl("שלום & #1");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("שלום & #1");
  });
});
