import { describe, expect, it } from "vitest";
import { parseSimDate } from "./simDate";

describe("parseSimDate (1.10)", () => {
  it("accepts real calendar dates only", () => {
    expect(parseSimDate("2026-11-11")).toBe("2026-11-11");
    expect(parseSimDate("2027-02-29")).toBeNull();
    expect(parseSimDate("2026-13-01")).toBeNull();
    expect(parseSimDate("11/11/2026")).toBeNull();
  });
  it("supports turning it off", () => {
    expect(parseSimDate("off")).toBe("off");
    expect(parseSimDate(null)).toBeNull();
  });
});
