import { describe, expect, it } from "vitest";
import { FLAG_DEFAULTS, isEnabled } from "./flags";

describe("flags", () => {
  it("follows the phase defaults", () => {
    expect(isEnabled("themeSwitch", {})).toBe(true);
    expect(isEnabled("itineraryV2", {})).toBe(true);
    expect(isEnabled("cameraTranslate", {})).toBe(false);
    expect(isEnabled("assistant", {})).toBe(false);
  });

  it("lets a device override win over the default", () => {
    expect(isEnabled("assistant", { assistant: true })).toBe(true);
    expect(isEnabled("themeSwitch", { themeSwitch: false })).toBe(false);
  });

  it("keeps every Phase 3 flag off by default", () => {
    for (const k of ["cameraTranslate", "receiptScan", "assistant", "offlineMapSnapshots"] as const) {
      expect(FLAG_DEFAULTS[k]).toBe(false);
    }
  });
});
