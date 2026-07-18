import { describe, expect, it } from "vitest";
import {
  checkVerifier,
  decryptBlob,
  deriveKey,
  encryptBlob,
  makeVerifier,
  randomSaltB64,
} from "./docCrypto";

describe("docCrypto", () => {
  it("round-trips a file through encrypt/decrypt with the right PIN", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("482913", salt);
    const original = new Blob(["passport bytes — דרכון"], { type: "application/pdf" });
    const container = await encryptBlob(key, original);
    // container must not contain the plaintext
    expect(await container.text()).not.toContain("passport");
    const back = await decryptBlob(key, container, "application/pdf");
    expect(await back.text()).toBe("passport bytes — דרכון");
    expect(back.type).toBe("application/pdf");
  });

  it("fails to decrypt with the wrong PIN", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("111111", salt);
    const container = await encryptBlob(key, new Blob(["secret"]));
    const wrong = await deriveKey("222222", salt);
    await expect(decryptBlob(wrong, container, "text/plain")).rejects.toBeTruthy();
  });

  it("verifier accepts the correct PIN and rejects a wrong one", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("123456", salt);
    const v = await makeVerifier(key);
    expect(await checkVerifier(key, v)).toBe(true);
    const wrong = await deriveKey("654321", salt);
    expect(await checkVerifier(wrong, v)).toBe(false);
  });
});
