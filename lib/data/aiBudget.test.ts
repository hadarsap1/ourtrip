import { describe, expect, it } from "vitest";
import { parseAiBudget } from "./aiBudget";

describe("parseAiBudget", () => {
  it("accepts amounts from 0 to 200", () => {
    expect(parseAiBudget("10")).toBe(10);
    expect(parseAiBudget(" 0 ")).toBe(0);
    expect(parseAiBudget("200")).toBe(200);
    expect(parseAiBudget("12,5")).toBe(12.5);
    expect(parseAiBudget("7.499")).toBe(7.5);
  });

  it("rejects empty, negative, too large and non-numbers", () => {
    expect(parseAiBudget("")).toBeNull();
    expect(parseAiBudget("-1")).toBeNull();
    expect(parseAiBudget("200.01")).toBeNull();
    expect(parseAiBudget("abc")).toBeNull();
  });
});
