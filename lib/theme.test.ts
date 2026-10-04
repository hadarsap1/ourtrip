import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_BOOT_SCRIPT } from "./theme";

describe("theme", () => {
  it("resolves system against the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("keeps an explicit choice regardless of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("boot script is self-contained and never throws out of its try", () => {
    expect(THEME_BOOT_SCRIPT.startsWith("(function(){try{")).toBe(true);
    expect(() => new Function(THEME_BOOT_SCRIPT)).not.toThrow();
  });
});
