// Client-side end-to-end encryption for locked documents (WebCrypto).
//
// The vault key is AES-GCM-256, derived from the family Documents passphrase
// with PBKDF2-SHA256. The key and passphrase are never stored or sent
// anywhere; the server only ever holds ciphertext. A forgotten passphrase is
// unrecoverable.
//
// Two things carry the cost of that derivation, and both are per-vault rather
// than hardcoded, because changing either for an existing vault would make
// its documents undecryptable:
//   * the salt, stored in document_pin.salt
//   * the iteration count, stored in document_pin.iterations
// Vaults created before the 2026-08 review used 210k; new ones use 600k
// (LEGACY_ITERATIONS / CURRENT_ITERATIONS below).
//
// The raw key BITS matter as well as the CryptoKey: a device passkey unlocks
// the vault by holding an encrypted copy of those bits (see lib/webauthn.ts
// and lib/data/docPin.ts), so deriveKeyBits/importVaultKey are separated and
// the imported key stays non-extractable - the bits are handled explicitly
// where wrapping needs them, never pulled back out of a live key.

/** PBKDF2 cost for vaults created before the 2026-08 hardening. */
export const LEGACY_ITERATIONS = 210_000;
/** PBKDF2 cost for new vaults - current OWASP guidance for PBKDF2-SHA256. */
export const CURRENT_ITERATIONS = 600_000;

const VERIFIER_TOKEN = "ourtrip-doc-pin-v1";
const IV_BYTES = 12;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

export { b64encode, b64decode };

export function randomSaltB64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Derives the raw 256-bit vault key material from the passphrase. */
export async function deriveKeyBits(
  passphrase: string,
  saltB64: string,
  iterations: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: b64decode(saltB64) as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Imports raw key material as the non-extractable AES-GCM vault key. */
export function importVaultKey(bits: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bits as BufferSource,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Passphrase → vault key, in one step. */
export async function deriveKey(
  passphrase: string,
  saltB64: string,
  iterations: number
): Promise<CryptoKey> {
  return importVaultKey(await deriveKeyBits(passphrase, saltB64, iterations));
}

export type Verifier = { iv: string; ct: string };

/** Encrypts a known token so any device can later confirm a passphrase. */
export async function makeVerifier(key: CryptoKey): Promise<Verifier> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(VERIFIER_TOKEN) as BufferSource
  );
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

export async function checkVerifier(key: CryptoKey, v: Verifier): Promise<boolean> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(v.iv) as BufferSource },
      key,
      b64decode(v.ct) as BufferSource
    );
    return new TextDecoder().decode(plain) === VERIFIER_TOKEN;
  } catch {
    return false;
  }
}

// ---------- key wrapping (device passkeys) ----------

export type WrappedKey = { iv: string; ct: string };

/**
 * Encrypts the vault key bits under a wrapping secret, for storage in
 * document_passkeys. The secret is the WebAuthn PRF output - 256 uniformly
 * random bits produced inside the authenticator - so it is used as AES-GCM
 * key material directly; there is no low-entropy input here to stretch.
 */
export async function wrapKeyBits(
  keyBits: Uint8Array,
  secret: Uint8Array
): Promise<WrappedKey> {
  const wrappingKey = await importWrappingKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    wrappingKey,
    keyBits as BufferSource
  );
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

/** Reverses wrapKeyBits. Throws when the secret is wrong or the blob is corrupt. */
export async function unwrapKeyBits(
  wrapped: WrappedKey,
  secret: Uint8Array
): Promise<Uint8Array> {
  const wrappingKey = await importWrappingKey(secret);
  const bits = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(wrapped.iv) as BufferSource },
    wrappingKey,
    b64decode(wrapped.ct) as BufferSource
  );
  return new Uint8Array(bits);
}

function importWrappingKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------- document bytes ----------

/** Encrypts a file into a self-contained container blob: [iv(12) || ciphertext]. */
export async function encryptBlob(key: CryptoKey, file: Blob): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    await file.arrayBuffer()
  );
  return new Blob([iv, ct], { type: "application/octet-stream" });
}

/** Decrypts a container blob back to the original file (throws on wrong key). */
export async function decryptBlob(
  key: CryptoKey,
  container: Blob,
  mime: string
): Promise<Blob> {
  const buf = new Uint8Array(await container.arrayBuffer());
  const iv = buf.subarray(0, IV_BYTES);
  const ct = buf.subarray(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  return new Blob([plain], { type: mime || "application/octet-stream" });
}
