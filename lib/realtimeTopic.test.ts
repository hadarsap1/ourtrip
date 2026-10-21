import { describe, expect, it } from "vitest";
import { spreadDelay } from "./realtimeTopic";

describe("spreadDelay", () => {
  it("never fires sooner than the base delay and stays within five times it", () => {
    for (let i = 0; i < 200; i++) {
      const ms = spreadDelay(200);
      expect(ms).toBeGreaterThanOrEqual(200);
      expect(ms).toBeLessThan(1000);
    }
  });
});
