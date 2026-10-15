import { describe, expect, it } from "vitest";
import { joinUrl, nameFromGoogle, parseJoinInfo, parseSubmitResult } from "./guestJoin";

describe("joinUrl", () => {
  it("joins origin and token without a double slash", () => {
    expect(joinUrl("https://x.app/", "abc")).toBe("https://x.app/join/abc");
  });
});

describe("parseJoinInfo", () => {
  it("reads a valid link with a status", () => {
    expect(parseJoinInfo({ valid: true, status: "pending" })).toEqual({ valid: true, status: "pending" });
  });
  it("treats anything unexpected as invalid with no status", () => {
    expect(parseJoinInfo(null)).toEqual({ valid: false, status: null });
    expect(parseJoinInfo({ valid: "yes", status: "declined" })).toEqual({ valid: false, status: null });
  });
});

describe("parseSubmitResult", () => {
  it("passes known answers through", () => {
    expect(parseSubmitResult("busy")).toBe("busy");
  });
  it("maps unknown answers to invalid", () => {
    expect(parseSubmitResult("weird")).toBe("invalid");
  });
});

describe("nameFromGoogle", () => {
  it("prefers the full name", () => {
    expect(nameFromGoogle({ full_name: " Dana Cohen ", name: "D" }, "d@x.com")).toBe("Dana Cohen");
  });
  it("falls back to the address", () => {
    expect(nameFromGoogle({}, "savta@x.com")).toBe("savta");
  });
});
