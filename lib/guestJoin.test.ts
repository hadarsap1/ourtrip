import { describe, expect, it } from "vitest";
import { approvedShareText, joinUrl, nameFromGoogle, parseJoinInfo, parseSubmitResult } from "./guestJoin";

describe("joinUrl", () => {
  it("joins origin and token without a double slash", () => {
    expect(joinUrl("https://x.app/", "abc")).toBe("https://x.app/j/abc");
  });
});

describe("parseJoinInfo", () => {
  it("marks the login screen's open token as Google only (00095)", () => {
    expect(parseJoinInfo({ valid: true, status: null, google_only: true }).googleOnly).toBe(true);
    expect(parseJoinInfo({ valid: true, google_only: "yes" }).googleOnly).toBe(false);
    expect(parseSubmitResult("google_only")).toBe("google_only");
  });

  it("reads a valid link with a status", () => {
    expect(parseJoinInfo({ valid: true, status: "pending" })).toEqual({ valid: true, status: "pending", googleOnly: false });
  });
  it("treats anything unexpected as invalid with no status", () => {
    expect(parseJoinInfo(null)).toEqual({ valid: false, status: null, googleOnly: false });
    expect(parseJoinInfo({ valid: "yes", status: "declined" })).toEqual({ valid: false, status: null, googleOnly: false });
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

describe("approvedShareText", () => {
  const base = { name: " סבתא רחל ", email: "savta@example.com", link: "https://x.supabase.co/auth/v1/verify?token=t" };

  it("a Google sign-up gets the app's address and their account, never the expiring link", () => {
    const text = approvedShareText({ ...base, viaGoogle: true }, "https://ourtrip-umber.vercel.app/");
    expect(text).toContain("היי סבתא רחל!");
    expect(text).toContain("savta@example.com");
    expect(text).toContain("https://ourtrip-umber.vercel.app/");
    expect(text).not.toContain(base.link);
  });

  it("a typed address gets the app's address to keep, their email, and the first sign-in link", () => {
    const text = approvedShareText({ ...base, viaGoogle: false }, "https://ourtrip-umber.vercel.app");
    expect(text).toContain("היי סבתא רחל!");
    expect(text).toContain("https://ourtrip-umber.vercel.app/\n");
    expect(text).toContain("savta@example.com");
    expect(text).toContain(base.link);
    expect(text).not.toContain("לזמן קצר");
    expect(text).not.toContain("עכשיו:");
    expect(text.indexOf("https://ourtrip-umber.vercel.app/")).toBeLessThan(text.indexOf(base.link));
  });
});
