import { describe, expect, it } from "vitest";
import { deriveKey, encryptBlob, randomSaltB64 } from "@/lib/docCrypto";
import { peelVaultLayers } from "@/lib/data/documents";

const pdf = () => new Blob([new TextEncoder().encode("%PDF-1.7\n" + "x".repeat(64))]);

describe("peelVaultLayers", () => {
  it("recovers a document that was locked twice", async () => {
    const key = await deriveKey("pass", randomSaltB64(), 1000);
    const twice = await encryptBlob(key, await encryptBlob(key, pdf()));
    const out = await peelVaultLayers(twice, key);
    expect(out.type).toBe("application/pdf");
    expect(await out.text()).toBe(await pdf().text());
  });

  it("leaves a real file alone", async () => {
    const key = await deriveKey("pass", randomSaltB64(), 1000);
    const out = await peelVaultLayers(pdf(), key);
    expect(await out.text()).toBe(await pdf().text());
  });

  it("does not touch bytes under a different key", async () => {
    const key = await deriveKey("pass", randomSaltB64(), 1000);
    const other = await deriveKey("other", randomSaltB64(), 1000);
    const foreign = await encryptBlob(other, pdf());
    const out = await peelVaultLayers(foreign, key);
    expect(out.size).toBe(foreign.size);
    expect(out.type).toBe("application/octet-stream");
  });
});
