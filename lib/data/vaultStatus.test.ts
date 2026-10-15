import { describe, expect, it } from "vitest";
import { vaultStatus } from "./vaultStatus";

const doc = (id: string, pin_protected: boolean) => ({ id, pin_protected });

describe("vaultStatus", () => {
  it("is ready only when every document is locked and on the device", () => {
    const docs = [doc("a", true), doc("b", true)];
    expect(vaultStatus(docs, new Set(["a", "b"])).ready).toBe(true);
    expect(vaultStatus(docs, new Set(["a"])).ready).toBe(false);
    expect(vaultStatus([doc("a", true), doc("b", false)], new Set(["a", "b"])).ready).toBe(false);
  });

  it("counts locked and on-device separately", () => {
    const s = vaultStatus([doc("a", true), doc("b", false), doc("c", false)], new Set(["b", "x"]));
    expect(s).toMatchObject({ total: 3, locked: 1, onDevice: 1, allLocked: false, allOnDevice: false });
  });

  it("an empty vault is not ready", () => {
    expect(vaultStatus([], new Set()).ready).toBe(false);
  });
});
