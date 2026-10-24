import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { joinUrl } from "./guestJoin";

// The join link is printed on stickers (Hadar 20/10/2026). Whatever changes,
// https://ourtrip-umber.vercel.app/j/<token> must keep landing on the join page.
describe("printed join link", () => {
  it("is built on the /j/ path", () => {
    expect(joinUrl("https://ourtrip-umber.vercel.app", "2e4t8jvm")).toBe(
      "https://ourtrip-umber.vercel.app/j/2e4t8jvm"
    );
  });

  it("/j/<token> still redirects to /join/<token>", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({ source: "/j/:token", destination: "/join/:token", permanent: false });
  });
});
