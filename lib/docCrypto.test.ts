import { describe, expect, it } from "vitest";
import {
  CURRENT_ITERATIONS,
  LEGACY_ITERATIONS,
  checkVerifier,
  decryptBlob,
  deriveKey,
  deriveKeyBits,
  encryptBlob,
  importVaultKey,
  makeVerifier,
  randomSaltB64,
  unwrapKeyBits,
  wrapKeyBits,
} from "./docCrypto";

// Keep the test cost low: the production iteration counts are deliberately
// slow, and correctness here does not depend on them. The two tests that DO
// care about the count say so explicitly.
const FAST = 1_000;

const PASSPHRASE = "כלב-סגול-בטוקיו";

describe("docCrypto", () => {
  it("round-trips a file through encrypt/decrypt with the right passphrase", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey(PASSPHRASE, salt, FAST);
    const original = new Blob(["passport bytes — דרכון"], { type: "application/pdf" });
    const container = await encryptBlob(key, original);
    // container must not contain the plaintext
    expect(await container.text()).not.toContain("passport");
    const back = await decryptBlob(key, container, "application/pdf");
    expect(await back.text()).toBe("passport bytes — דרכון");
    expect(back.type).toBe("application/pdf");
  });

  it("fails to decrypt with the wrong passphrase", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey("correct-horse-battery", salt, FAST);
    const container = await encryptBlob(key, new Blob(["secret"]));
    const wrong = await deriveKey("correct-horse-batterz", salt, FAST);
    await expect(decryptBlob(wrong, container, "text/plain")).rejects.toBeTruthy();
  });

  it("verifier accepts the correct passphrase and rejects a wrong one", async () => {
    const salt = randomSaltB64();
    const key = await deriveKey(PASSPHRASE, salt, FAST);
    const v = await makeVerifier(key);
    expect(await checkVerifier(key, v)).toBe(true);
    const wrong = await deriveKey("something-else-entirely", salt, FAST);
    expect(await checkVerifier(wrong, v)).toBe(false);
  });

  // The iteration count is stored per vault precisely so that legacy vaults
  // keep opening. If deriving ignored it, every pre-2026-08 document would
  // become unreadable — so pin the behaviour down.
  it("derives a different key for a different iteration count", async () => {
    const salt = randomSaltB64();
    const a = await deriveKeyBits(PASSPHRASE, salt, FAST);
    const b = await deriveKeyBits(PASSPHRASE, salt, FAST * 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("a vault sealed at one iteration count only opens at that same count", async () => {
    const salt = randomSaltB64();
    const sealed = await deriveKey(PASSPHRASE, salt, FAST);
    const v = await makeVerifier(sealed);
    const atOtherCount = await deriveKey(PASSPHRASE, salt, FAST * 2);
    expect(await checkVerifier(atOtherCount, v)).toBe(false);
  });

  it("keeps the legacy cost below the new default", () => {
    expect(LEGACY_ITERATIONS).toBeLessThan(CURRENT_ITERATIONS);
    expect(CURRENT_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  describe("key wrapping (device passkeys)", () => {
    it("unwraps back to the same vault key with the right PRF secret", async () => {
      const salt = randomSaltB64();
      const bits = await deriveKeyBits(PASSPHRASE, salt, FAST);
      const prfSecret = crypto.getRandomValues(new Uint8Array(32));

      const wrapped = await wrapKeyBits(bits, prfSecret);
      const back = await unwrapKeyBits(wrapped, prfSecret);

      expect(Array.from(back)).toEqual(Array.from(bits));

      // and the recovered key really opens documents sealed by the original
      const original = await importVaultKey(bits);
      const container = await encryptBlob(original, new Blob(["דרכון"]));
      const recovered = await importVaultKey(back);
      expect(await (await decryptBlob(recovered, container, "text/plain")).text()).toBe(
        "דרכון"
      );
    });

    it("refuses to unwrap with a different PRF secret", async () => {
      const bits = await deriveKeyBits(PASSPHRASE, randomSaltB64(), FAST);
      const wrapped = await wrapKeyBits(bits, crypto.getRandomValues(new Uint8Array(32)));
      const otherDevice = crypto.getRandomValues(new Uint8Array(32));
      await expect(unwrapKeyBits(wrapped, otherDevice)).rejects.toBeTruthy();
    });

    it("stores no plaintext key material in the wrapped blob", async () => {
      const bits = await deriveKeyBits(PASSPHRASE, randomSaltB64(), FAST);
      const wrapped = await wrapKeyBits(bits, crypto.getRandomValues(new Uint8Array(32)));
      let raw = "";
      for (const b of bits) raw += String.fromCharCode(b);
      expect(wrapped.ct).not.toContain(btoa(raw));
    });
  });
});
