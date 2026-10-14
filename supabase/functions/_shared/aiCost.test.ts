import { describe, expect, it } from "vitest";
import { AI_DAILY_CAPS, costUsd, inputTokens, priceKey, priceOf } from "./aiCost";

describe("aiCost", () => {
  it("strips a date suffix from the model id", () => {
    expect(priceKey("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
    expect(priceKey("claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
  });

  it("prices haiku 4.5 at $1 / $5 per million", () => {
    expect(costUsd("claude-haiku-4-5-20251001", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(1);
    expect(costUsd("claude-haiku-4-5-20251001", { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(5);
  });

  it("prices sonnet 5.5 and opus 5", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 10_000, output_tokens: 2_000 })).toBeCloseTo(0.04);
    expect(costUsd("claude-opus-5", { input_tokens: 10_000, output_tokens: 2_000 })).toBeCloseTo(0.1);
  });

  it("bills cache writes at 1.25x and reads at 0.1x input", () => {
    const c = costUsd("claude-sonnet-5-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(c).toBeCloseTo(2 * 1.25 + 2 * 0.1);
  });

  it("prices an unknown model as the most expensive, never cheaper", () => {
    expect(priceOf("claude-something-new").output).toBeGreaterThan(priceOf("claude-opus-5").output);
    expect(priceOf("claude-something-new").input).toBeGreaterThan(priceOf("claude-opus-5").input);
  });

  it("treats missing or negative usage as zero", () => {
    expect(costUsd("claude-sonnet-5-5", null)).toBe(0);
    expect(costUsd("claude-sonnet-5-5", { input_tokens: -5, output_tokens: undefined })).toBe(0);
    expect(inputTokens({ input_tokens: 3, cache_read_input_tokens: 2 })).toBe(5);
  });

  it("has a daily cap for every AI function", () => {
    for (const fn of [
      "booking-paste",
      "gmail-bookings",
      "extract-places",
      "recommend",
      "translate-phrase",
      "phrasebook-generate",
      "facts-generate",
      "emergency-autofill",
    ]) {
      expect(AI_DAILY_CAPS[fn]).toBeGreaterThan(0);
    }
  });
});
