import { describe, expect, it } from "vitest";
import { FLAG_BOOT_SCRIPT, isEnabled } from "./flags";

function run(href: string, stored: Record<string, boolean> = {}) {
  const store: Record<string, string> = { "ourtrip-flags": JSON.stringify(stored) };
  let replaced: string | null = null;
  const env = {
    location: { href },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    history: { replaceState: (_: unknown, __: string, url: string) => (replaced = url) },
    URL,
  };
  new Function("location", "localStorage", "history", "URL", FLAG_BOOT_SCRIPT)(env.location, env.localStorage, env.history, env.URL);
  return { flags: JSON.parse(store["ourtrip-flags"]) as Record<string, boolean>, replaced };
}

describe("?test= flag boot script", () => {
  it("turns listed flags on for this device and cleans the address bar", () => {
    const r = run("https://x.app/more?test=stepsCounter,budgetV2&a=1#h");
    expect(r.flags).toEqual({ stepsCounter: true, budgetV2: true });
    expect(r.replaced).toBe("/more?a=1#h");
    expect(isEnabled("stepsCounter", r.flags)).toBe(true);
  });

  it("turns one off with a minus, ignores unknown names", () => {
    const r = run("https://x.app/?test=-budgetV2,notAFlag", { budgetV2: true, planMyDay: true });
    expect(r.flags).toEqual({ budgetV2: false, planMyDay: true });
  });

  it("reset clears every override", () => {
    expect(run("https://x.app/?test=reset", { budgetV2: true }).flags).toEqual({});
  });

  it("does nothing without the parameter", () => {
    const r = run("https://x.app/?a=1", { budgetV2: true });
    expect(r.flags).toEqual({ budgetV2: true });
    expect(r.replaced).toBeNull();
  });
});
