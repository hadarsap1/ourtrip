import { describe, expect, it } from "vitest";
import { planDocSync } from "./docSync";

describe("planDocSync (F1)", () => {
  const docs = [
    { id: "pass", pin_protected: true },
    { id: "visa", pin_protected: false },
    { id: "ins", pin_protected: false },
  ];

  it("fetches PIN-protected files without the vault key (already ciphertext)", () => {
    const { fetch, locked } = planDocSync(docs, new Set(), false);
    expect(fetch.map((d) => d.id)).toEqual(["pass"]);
    expect(locked.map((d) => d.id)).toEqual(["visa", "ins"]);
  });

  it("fetches everything missing once the vault is open", () => {
    const { fetch, locked } = planDocSync(docs, new Set(["visa"]), true);
    expect(fetch.map((d) => d.id)).toEqual(["pass", "ins"]);
    expect(locked).toEqual([]);
  });

  it("skips what is already on the device", () => {
    expect(planDocSync(docs, new Set(["pass", "visa", "ins"]), true).fetch).toEqual([]);
  });
});
