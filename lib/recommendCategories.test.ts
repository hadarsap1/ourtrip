import { describe, expect, it } from "vitest";
import { categoryIcon, RECOMMEND_CATEGORIES } from "./recommendCategories";

describe("categoryIcon", () => {
  it("returns a distinct icon for every known category", () => {
    for (const c of RECOMMEND_CATEGORIES) {
      expect(categoryIcon(c)).not.toBe("📍");
    }
  });

  it("falls back to a pin for unknown/null categories", () => {
    expect(categoryIcon(null)).toBe("📍");
    expect(categoryIcon("שטויות")).toBe("📍");
  });
});
