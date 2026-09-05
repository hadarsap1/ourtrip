// Biometric unlock for the documents vault, via WebAuthn + the PRF extension.
//
// What this is NOT: face recognition. There is no browser API that hands us a
// face, and we never receive, transmit or store a biometric template. Face ID
// / Touch ID / Android biometric are exposed to the web only through
// WebAuthn: the platform authenticator verifies the user locally and hands
// back a cryptographic result. The biometric never leaves the device.
//
// The PRF extension is what makes this useful for an END-TO-END ENCRYPTED
// vault. A plain WebAuthn assertion is a signature - it proves "the right
// person is here", but it yields no key, so building on it would mean
// stashing the vault key on the device behind a UI check. That is a gate, not
// a boundary: anyone holding the device reads the key straight out of storage.
// PRF instead returns a stable 256-bit secret, derived inside the
// authenticator from (credential, salt). That secret encrypts a copy of the
// vault key (lib/docCrypto wrapKeyBits), so the key genuinely cannot be
// recovered without the authenticator.
//
// Support caveat: PRF needs a platform authenticator and a browser that
// implements it. Everything here feature-detects and fails soft - callers
// fall back to the passphrase, which always works.

const RP_NAME = "OurTrip";
const PRF_SALT_BYTES = 32;
const TIMEOUT_MS = 60_000;

// lib.dom does not yet type the PRF extension, so describe the shape we use.
type PrfExtensionInput = {
  prf?: { eval?: { first: BufferSource } };
};
type PrfExtensionOutput = {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function randomPrfSaltB64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES)));
}

/** True when this browser can do WebAuthn with a built-in (platform) authenticator. */
export async function isPasskeySupported(): Promise<boolean> {
  try {
    if (
      typeof window === "undefined" ||
      typeof PublicKeyCredential === "undefined" ||
      !navigator.credentials
    ) {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** A best-effort device name for the enrolment list, so a lost phone is findable. */
export function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "מכשיר";
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "טלפון Android" : "טאבלט Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "מכשיר";
}

function prfSecretFrom(credential: PublicKeyCredential): Uint8Array | null {
  const ext = credential.getClientExtensionResults() as PrfExtensionOutput;
  const first = ext.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

export type EnrolledCredential = {
  credentialId: string; // base64url
  prfSecret: Uint8Array;
};

/**
 * Creates a platform credential and returns its PRF secret.
 *
 * Registration and evaluation are two steps on purpose: several browsers
 * report only `prf.enabled` from create() and withhold the results until an
 * assertion, so we register, then immediately authenticate to read the
 * secret. That also proves the credential really can unlock the vault before
 * we store anything against it.
 */
export async function enrollPrfCredential(input: {
  userId: string; // stable per family member
  userName: string;
  prfSaltB64: string;
}): Promise<EnrolledCredential> {
  const prfSalt = b64decode(input.prfSaltB64);

  const created = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: RP_NAME },
      user: {
        id: new TextEncoder().encode(input.userId),
        name: input.userName,
        displayName: input.userName,
      },
      // ES256 then RS256 - every platform authenticator supports one of these
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        // the biometric IS the point - never accept a silent assertion
        userVerification: "required",
      },
      timeout: TIMEOUT_MS,
      attestation: "none",
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as PrfExtensionInput,
    },
  })) as PublicKeyCredential | null;

  if (!created) throw new Error("passkey_cancelled");

  const ext = created.getClientExtensionResults() as PrfExtensionOutput;
  if (ext.prf?.enabled === false) throw new Error("prf_unsupported");

  const credentialId = b64urlEncode(created.rawId);

  // Read the secret. Some browsers already returned it above; most need the
  // assertion below.
  const direct = prfSecretFrom(created);
  if (direct) return { credentialId, prfSecret: direct };

  const assertion = await evaluatePrf([credentialId], input.prfSaltB64);
  if (!assertion) throw new Error("prf_unsupported");
  return assertion;
}

/**
 * Authenticates with one of the given credentials and returns its PRF secret.
 * Resolves null when the authenticator has no PRF output to give (the caller
 * then falls back to the passphrase); throws when the user cancels.
 */
export async function evaluatePrf(
  credentialIds: string[],
  prfSaltB64: string
): Promise<EnrolledCredential | null> {
  const prfSalt = b64decode(prfSaltB64);

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentialIds.map((id) => ({
        type: "public-key" as const,
        id: b64urlDecode(id) as BufferSource,
      })),
      userVerification: "required",
      timeout: TIMEOUT_MS,
      extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as PrfExtensionInput,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) return null;
  const prfSecret = prfSecretFrom(assertion);
  if (!prfSecret) return null;
  return { credentialId: b64urlEncode(assertion.rawId), prfSecret };
}
