import { describe, expect, it } from "vitest";
import { kidTagText, nameWithKidTag, normalizeKidNames } from "./kidTag";

describe("normalizeKidNames", () => {
  it("trims, drops blanks and repeats, keeps three", () => {
    expect(normalizeKidNames([" יואב ", "", null, "נועה", "יואב", "תמר", "עוד"])).toEqual(["יואב", "נועה", "תמר"]);
  });
  it("cuts a long name at 40 characters", () => {
    expect(normalizeKidNames(["x".repeat(50)])).toEqual(["x".repeat(40)]);
  });
});

describe("kidTagText", () => {
  it("joins the names in Hebrew", () => {
    expect(kidTagText([])).toBe("");
    expect(kidTagText(null)).toBe("");
    expect(kidTagText(["יואב"])).toBe("של יואב");
    expect(kidTagText(["יואב", "נועה"])).toBe("של יואב ונועה");
    expect(kidTagText(["יואב", "נועה", "תמר"])).toBe("של יואב, נועה ותמר");
  });
});

describe("nameWithKidTag", () => {
  it("adds the tag in brackets, or leaves the name alone", () => {
    expect(nameWithKidTag("דנה", ["יואב"])).toBe("דנה (של יואב)");
    expect(nameWithKidTag("דנה", [])).toBe("דנה");
    expect(nameWithKidTag("", ["יואב"])).toBe("");
  });
});
