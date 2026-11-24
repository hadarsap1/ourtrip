import { describe, expect, it } from "vitest";
import { cronSecretOk, type SecretLookup } from "./cronAuth";

const noWait = async () => {};
function lookups(...answers: Array<{ data: unknown; error: unknown } | "throw">) {
  const calls: string[] = [];
  const fn: SecretLookup = async (s) => {
    calls.push(s);
    const a = answers[calls.length - 1] ?? { data: null, error: "no more answers" };
    if (a === "throw") throw new Error("network");
    return a;
  };
  return { fn, calls };
}

describe("cron secret check", () => {
  it("refuses a missing header without asking the database", async () => {
    const l = lookups({ data: true, error: null });
    expect(await cronSecretOk(null, undefined, l.fn, noWait)).toBe(false);
    expect(await cronSecretOk("", undefined, l.fn, noWait)).toBe(false);
    expect(l.calls).toHaveLength(0);
  });

  it("compares with CRON_SECRET when it is set", async () => {
    const l = lookups({ data: true, error: null });
    expect(await cronSecretOk("abc", "abc", l.fn, noWait)).toBe(true);
    expect(await cronSecretOk("abd", "abc", l.fn, noWait)).toBe(false);
    expect(await cronSecretOk("ab", "abc", l.fn, noWait)).toBe(false);
    expect(l.calls).toHaveLength(0);
  });

  it("accepts when the database says it matches", async () => {
    const l = lookups({ data: true, error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(true);
    expect(l.calls).toHaveLength(1);
  });

  it("a wrong secret is final: no retry", async () => {
    const l = lookups({ data: false, error: null }, { data: true, error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(false);
    expect(l.calls).toHaveLength(1);
  });

  it("retries once after an error (PGRST303) and accepts a match", async () => {
    const l = lookups({ data: null, error: { code: "PGRST303" } }, { data: true, error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(true);
    expect(l.calls).toHaveLength(2);
  });

  it("retries a thrown lookup too", async () => {
    const l = lookups("throw", { data: true, error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(true);
  });

  it("fails closed after two errors", async () => {
    const l = lookups({ data: null, error: "x" }, { data: null, error: "x" }, { data: true, error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(false);
    expect(l.calls).toHaveLength(2);
  });

  it("only a literal true counts", async () => {
    const l = lookups({ data: "true", error: null });
    expect(await cronSecretOk("s", undefined, l.fn, noWait)).toBe(false);
  });
});
