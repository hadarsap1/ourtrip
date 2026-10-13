import { describe, expect, it } from "vitest";
import { bridgeTarget } from "./messages";

const msg = (over: Partial<{ channel: "family" | "guests"; origin_message_id: string | null; origin_comment_id: string | null }>) => ({
  channel: "family" as const,
  origin_message_id: null,
  origin_comment_id: null,
  ...over,
});

describe("bridgeTarget", () => {
  it("offers a kid's family message to the guests, and a guest's message to the kids", () => {
    expect(bridgeTarget(msg({ channel: "family" }), "kid")).toBe("guests");
    expect(bridgeTarget(msg({ channel: "guests" }), "guest")).toBe("family");
  });
  it("never offers a parent's own message, or a copy, for bridging", () => {
    expect(bridgeTarget(msg({ channel: "family" }), "owner")).toBeNull();
    expect(bridgeTarget(msg({ channel: "guests" }), "owner")).toBeNull();
    expect(bridgeTarget(msg({ channel: "family", origin_message_id: "x" }), "kid")).toBeNull();
    expect(bridgeTarget(msg({ channel: "family", origin_comment_id: "c" }), "guest")).toBeNull();
  });
});
