import { getSupabase } from "@/lib/supabase";
import {
  CURRENT_ITERATIONS,
  LEGACY_ITERATIONS,
  checkVerifier,
  deriveKeyBits,
  importVaultKey,
  makeVerifier,
  randomSaltB64,
  unwrapKeyBits,
  wrapKeyBits,
  type Verifier,
} from "@/lib/docCrypto";
import {
  enrollPrfCredential,
  evaluatePrf,
  guessDeviceLabel,
  randomPrfSaltB64,
} from "@/lib/webauthn";

// The vault key lives in memory only, for the session — unlocking once opens
// the vault until reload or an explicit lock. The salt, iteration count and
// verifier are cached in localStorage so a passphrase can still be checked
// offline (a lost device is the whole point of the vault).
//
// The raw key bits are cached alongside the CryptoKey because enrolling a
// device passkey needs to encrypt them. They are never written to disk.

let cachedKey: CryptoKey | null = null;
let cachedBits: Uint8Array | null = null;
let cachedTripId: string | null = null;

/** Minimum passphrase length for a NEW vault. Existing short PINs still open. */
export const MIN_PASSPHRASE_LENGTH = 10;

type PinRow = {
  salt: string;
  iterations: number;
  verifier: Verifier;
  prfSalt: string | null;
};

function localKey(tripId: string): string {
  return `ourtrip-docpin-${tripId}`;
}

/** Local hint for "is THIS device enrolled" — UI only, never a security check. */
function localCredKey(tripId: string): string {
  return `ourtrip-docpasskey-${tripId}`;
}

function cacheLocal(tripId: string, row: PinRow): void {
  try {
    localStorage.setItem(localKey(tripId), JSON.stringify(row));
  } catch {
    // best-effort
  }
}

function readLocal(tripId: string): PinRow | null {
  try {
    const raw = localStorage.getItem(localKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PinRow>;
    if (!parsed.salt || !parsed.verifier) return null;
    return {
      salt: parsed.salt,
      // vaults cached before the iteration column existed were all legacy
      iterations: parsed.iterations ?? LEGACY_ITERATIONS,
      verifier: parsed.verifier,
      prfSalt: parsed.prfSalt ?? null,
    };
  } catch {
    return null;
  }
}

/** Fetches the trip's vault record (server first, local cache as offline fallback). */
async function fetchPinRow(tripId: string): Promise<PinRow | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("document_pin")
      .select("salt, iterations, prf_salt, verifier_iv, verifier_ct")
      .eq("trip_id", tripId)
      .maybeSingle();
    if (data) {
      const row: PinRow = {
        salt: data.salt,
        iterations: data.iterations ?? LEGACY_ITERATIONS,
        verifier: { iv: data.verifier_iv, ct: data.verifier_ct },
        prfSalt: data.prf_salt ?? null,
      };
      cacheLocal(tripId, row);
      return row;
    }
  }
  return readLocal(tripId);
}

export async function hasDocPin(tripId: string): Promise<boolean> {
  return (await fetchPinRow(tripId)) !== null;
}

function remember(tripId: string, bits: Uint8Array, key: CryptoKey): void {
  cachedBits = bits;
  cachedKey = key;
  cachedTripId = tripId;
}

/** Sets the Documents passphrase for the first time. Fails if one already
 *  exists (changing it would require re-encrypting every locked document). */
export async function setDocPin(tripId: string, passphrase: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  if (await hasDocPin(tripId)) throw new Error("pin_exists");

  const salt = randomSaltB64();
  const bits = await deriveKeyBits(passphrase, salt, CURRENT_ITERATIONS);
  const key = await importVaultKey(bits);
  const verifier = await makeVerifier(key);

  const { error } = await supabase.from("document_pin").insert({
    trip_id: tripId,
    salt,
    iterations: CURRENT_ITERATIONS,
    verifier_iv: verifier.iv,
    verifier_ct: verifier.ct,
  });
  if (error) throw new Error(error.message);

  remember(tripId, bits, key);
  cacheLocal(tripId, {
    salt,
    iterations: CURRENT_ITERATIONS,
    verifier,
    prfSalt: null,
  });
}

/** Verifies the passphrase and unlocks the vault for this session. Returns
 *  false on a wrong passphrase (or when no vault has been set up). */
export async function unlockDocPin(tripId: string, passphrase: string): Promise<boolean> {
  const row = await fetchPinRow(tripId);
  if (!row) return false;
  const bits = await deriveKeyBits(passphrase, row.salt, row.iterations);
  const key = await importVaultKey(bits);
  if (!(await checkVerifier(key, row.verifier))) return false;
  remember(tripId, bits, key);
  return true;
}

export function isVaultUnlocked(tripId: string): boolean {
  return cachedKey !== null && cachedTripId === tripId;
}

export function getVaultKey(tripId: string): CryptoKey | null {
  return isVaultUnlocked(tripId) ? cachedKey : null;
}

export function lockVault(): void {
  cachedKey = null;
  cachedBits?.fill(0);
  cachedBits = null;
  cachedTripId = null;
}

// ---------- device passkeys (biometric unlock) ----------

export type VaultPasskey = {
  id: string;
  label: string;
  credentialId: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listPasskeys(tripId: string): Promise<VaultPasskey[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("document_passkeys")
    .select("id, label, credential_id, created_at, last_used_at")
    .eq("trip_id", tripId)
    .order("created_at");
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    label: r.label,
    credentialId: r.credential_id,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/** True when this specific device believes it has enrolled — a UI hint only. */
export function isThisDeviceEnrolled(tripId: string): boolean {
  try {
    return !!localStorage.getItem(localCredKey(tripId));
  } catch {
    return false;
  }
}

/**
 * Enrols this device's authenticator so the vault can be opened with Face ID
 * / Touch ID / Android biometric. Requires the vault to be unlocked already:
 * we encrypt the live key under the credential's PRF secret, which is the
 * only way a passkey can open an end-to-end encrypted vault without the
 * passphrase being stored anywhere.
 */
export async function enrollPasskey(
  tripId: string,
  memberId: string,
  label?: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  if (!isVaultUnlocked(tripId) || !cachedBits) throw new Error("vault_locked");

  const row = await fetchPinRow(tripId);
  if (!row) throw new Error("no_vault");

  // The vault's PRF salt is shared by every enrolled device; create it on the
  // first enrolment (including for vaults that predate this feature).
  let prfSalt = row.prfSalt;
  if (!prfSalt) {
    prfSalt = randomPrfSaltB64();
    const { error } = await supabase
      .from("document_pin")
      .update({ prf_salt: prfSalt })
      .eq("trip_id", tripId);
    if (error) throw new Error(error.message);
    cacheLocal(tripId, { ...row, prfSalt });
  }

  const deviceLabel = (label ?? guessDeviceLabel()).slice(0, 60);

  const { credentialId, prfSecret } = await enrollPrfCredential({
    userId: memberId,
    userName: deviceLabel,
    prfSaltB64: prfSalt,
  });

  const wrapped = await wrapKeyBits(cachedBits, prfSecret);
  prfSecret.fill(0);

  const { error } = await supabase.from("document_passkeys").insert({
    trip_id: tripId,
    credential_id: credentialId,
    wrapped_key_iv: wrapped.iv,
    wrapped_key_ct: wrapped.ct,
    label: deviceLabel,
    created_by: memberId,
  });
  if (error) throw new Error(error.message);

  try {
    localStorage.setItem(localCredKey(tripId), credentialId);
  } catch {
    // hint only
  }
}

export type PasskeyUnlockResult =
  | "ok"
  | "cancelled"
  | "unsupported"
  | "no_passkeys";

/**
 * Opens the vault with a device biometric. The authenticator returns a secret
 * that decrypts the stored copy of the vault key — the server never sees
 * either, and no passphrase is involved.
 */
export async function unlockWithPasskey(tripId: string): Promise<PasskeyUnlockResult> {
  const supabase = getSupabase();
  if (!supabase) return "unsupported";

  const row = await fetchPinRow(tripId);
  if (!row?.prfSalt) return "no_passkeys";

  const { data, error } = await supabase
    .from("document_passkeys")
    .select("id, credential_id, wrapped_key_iv, wrapped_key_ct")
    .eq("trip_id", tripId);
  if (error || !data || data.length === 0) return "no_passkeys";

  let result;
  try {
    result = await evaluatePrf(
      data.map((r) => r.credential_id),
      row.prfSalt
    );
  } catch {
    // user dismissed the biometric prompt, or the authenticator refused
    return "cancelled";
  }
  if (!result) return "unsupported";

  const match = data.find((r) => r.credential_id === result.credentialId);
  if (!match) {
    result.prfSecret.fill(0);
    return "unsupported";
  }

  try {
    const bits = await unwrapKeyBits(
      { iv: match.wrapped_key_iv, ct: match.wrapped_key_ct },
      result.prfSecret
    );
    remember(tripId, bits, await importVaultKey(bits));
  } catch {
    // wrapped key does not match this credential — treat as unusable
    return "unsupported";
  } finally {
    result.prfSecret.fill(0);
  }

  await supabase
    .from("document_passkeys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", match.id);

  return "ok";
}

/** Removes an enrolled device — the revocation path for a lost phone. */
export async function removePasskey(tripId: string, id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data, error } = await supabase
    .from("document_passkeys")
    .delete()
    .eq("id", id)
    .select("credential_id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // if we just removed THIS device, drop the local hint too
  try {
    if (data && localStorage.getItem(localCredKey(tripId)) === data.credential_id) {
      localStorage.removeItem(localCredKey(tripId));
    }
  } catch {
    // hint only
  }
}
