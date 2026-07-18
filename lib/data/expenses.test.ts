import { describe, expect, it } from "vitest";
import { isConnectivityError } from "./expenses";

describe("isConnectivityError", () => {
  it("treats fetch/network errors as connectivity (transient) failures", () => {
    expect(isConnectivityError(new Error("fetch failed"))).toBe(true);
    expect(isConnectivityError(new Error("NetworkError when attempting"))).toBe(true);
  });

  it("treats validation/RLS/fx errors as permanent (not connectivity)", () => {
    expect(isConnectivityError(new Error("fx"))).toBe(false);
    expect(isConnectivityError(new Error("new row violates row-level security"))).toBe(false);
    expect(isConnectivityError(new Error("duplicate key value"))).toBe(false);
  });
});
