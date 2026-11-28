import { describe, expect, it, vi } from "vitest";
import { cronSecretOk } from "./cronAuth";

const noWait = () => Promise.resolve();

describe("cronSecretOk", () => {
  it("refuses a missing header without asking", async () => {
    const lookup = vi.fn();
    expect(await cronSecretOk(null, undefined, lookup, noWait)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("compares with the function secret when one is set", async () => {
    const lookup = vi.fn();
    expect(await cronSecretOk("abc", "abc", lookup, noWait)).toBe(true);
    expect(await cronSecretOk("abd", "abc", lookup, noWait)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("retries one lookup error, then trusts the answer", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST303" } })
      .mockResolvedValueOnce({ data: true, error: null });
    expect(await cronSecretOk("s", undefined, lookup, noWait)).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("a clear false is final", async () => {
    const lookup = vi.fn().mockResolvedValue({ data: false, error: null });
    expect(await cronSecretOk("s", undefined, lookup, noWait)).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("fails closed after two errors or throws", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("down"));
    expect(await cronSecretOk("s", undefined, lookup, noWait)).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
