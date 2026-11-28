import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRIEND_CODE_LENGTH, isFriendCode, isPin } from "./friendCode";

describe("friend codes", () => {
  it("tells a friend code from a kid code by its length", () => {
    expect(isFriendCode("ABCD2345")).toBe(true);
    expect(isFriendCode(" ABCD2345 ")).toBe(true);
    expect(isFriendCode("ABC234")).toBe(false);
    expect(isFriendCode("ABCD234")).toBe(false);
  });

  it("matches the length the server makes and the kid code does not", () => {
    const read = (name: string) => readFileSync(join(__dirname, "..", "supabase/functions", name, "index.ts"), "utf8");
    expect(read("friend-auth")).toContain(`const CODE_LENGTH = ${FRIEND_CODE_LENGTH};`);
    expect(read("kid-auth")).toContain("new Uint8Array(6)");
  });

  it("accepts a PIN of 4 to 6 digits", () => {
    expect(isPin("1234")).toBe(true);
    expect(isPin("123456")).toBe(true);
    expect(isPin("123")).toBe(false);
    expect(isPin("12a4")).toBe(false);
  });
});
