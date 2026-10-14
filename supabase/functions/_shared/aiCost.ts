// Estimated USD cost of one Claude API response, from its `usage` and the
// list price of the model that answered. Feeds the monthly AI budget (00053).
//
// List prices per million tokens, input / output (Anthropic API, 10/2026).
// Cache writes are billed at 1.25x input, cache reads at 0.1x input. A model
// missing from the table is priced as the most expensive one, so a model
// swap can only make the estimate too high, never too low.

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
};
const FALLBACK = { input: 10, output: 50 };

export type AiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** "claude-haiku-4-5-20251001" -> "claude-haiku-4-5" */
export function priceKey(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export function priceOf(model: string): { input: number; output: number } {
  return PRICES[priceKey(model)] ?? FALLBACK;
}

export function costUsd(model: string, usage: AiUsage | null | undefined): number {
  if (!usage) return 0;
  const p = priceOf(model);
  const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  const inputEquivalent =
    n(usage.input_tokens) + 1.25 * n(usage.cache_creation_input_tokens) + 0.1 * n(usage.cache_read_input_tokens);
  return (inputEquivalent * p.input + n(usage.output_tokens) * p.output) / 1_000_000;
}

/** Input tokens as billed (fresh + cache writes + cache reads), for the log. */
export function inputTokens(usage: AiUsage | null | undefined): number {
  if (!usage) return 0;
  const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  return n(usage.input_tokens) + n(usage.cache_creation_input_tokens) + n(usage.cache_read_input_tokens);
}

/** Calls a trip may make to each AI function per day (UTC), on top of the
 *  monthly budget. Sized well above normal use: they exist to stop a loop or
 *  a stuck button from burning the month in an hour. */
export const AI_DAILY_CAPS: Record<string, number> = {
  "booking-paste": 60,
  "gmail-bookings": 30,
  "extract-places": 20,
  recommend: 40,
  "translate-phrase": 100,
  "phrasebook-generate": 10,
  "facts-generate": 10,
  "emergency-autofill": 20,
};
