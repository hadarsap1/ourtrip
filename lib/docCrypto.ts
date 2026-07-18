// Client-side end-to-end encryption for locked documents (WebCrypto).
// A master key is derived from the family Documents PIN — key = PBKDF2(PIN,
// salt, 210k, SHA-256) → AES-GCM-256 — and used to encrypt each locked file
// before upload. The key and PIN are never stored or sent anywhere; the
// server only ever holds ciphertext. A forgotten PIN is unrecoverable.

const PBKDF2_ITERATIONS = 210_000;
const VERIFIER_TOKEN = "ourtrip-doc-pin-v1";
const IV_BYTES = 12;
const SALT_BYTES = 16;

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

export function randomSaltB64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

export async function deriveKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64decode(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export type Verifier = { iv: string; ct: string };

/** Encrypts a known token so any device can later confirm a PIN is correct. */
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
