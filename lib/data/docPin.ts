import { getSupabase } from "@/lib/supabase";
import {
  checkVerifier,
  deriveKey,
  makeVerifier,
  randomSaltB64,
  type Verifier,
} from "@/lib/docCrypto";

// The derived AES key lives in memory only, for the session — entering the PIN
// once unlocks the vault until reload or an explicit lock. The salt + verifier
// are cached in localStorage (non-secret) so a PIN can still be verified
// offline (a lost device is the whole point).

let cachedKey: CryptoKey | null = null;
let cachedTripId: string | null = null;

type PinRow = { salt: string; verifier: Verifier };

function localKey(tripId: string): string {
  return `ourtrip-docpin-${tripId}`;
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
    return raw ? (JSON.parse(raw) as PinRow) : null;
  } catch {
    return null;
  }
}

/** Fetches the trip's PIN record (server first, local cache as offline fallback). */
async function fetchPinRow(tripId: string): Promise<PinRow | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("document_pin")
      .select("salt, verifier_iv, verifier_ct")
      .eq("trip_id", tripId)
      .maybeSingle();
    if (data) {
      const row: PinRow = {
        salt: data.salt,
        verifier: { iv: data.verifier_iv, ct: data.verifier_ct },
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

/** Sets the Documents PIN for the first time. Fails if one already exists
 *  (changing the PIN would require re-encrypting every locked document). */
export async function setDocPin(tripId: string, pin: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  if (await hasDocPin(tripId)) throw new Error("pin_exists");

  const salt = randomSaltB64();
  const key = await deriveKey(pin, salt);
  const verifier = await makeVerifier(key);

  const { error } = await supabase.from("document_pin").insert({
    trip_id: tripId,
    salt,
    verifier_iv: verifier.iv,
    verifier_ct: verifier.ct,
  });
  if (error) throw new Error(error.message);

  cachedKey = key;
  cachedTripId = tripId;
  cacheLocal(tripId, { salt, verifier });
}

/** Verifies the PIN and unlocks the vault for this session. Returns false on
 *  a wrong PIN (or when no PIN has been set). */
export async function unlockDocPin(tripId: string, pin: string): Promise<boolean> {
  const row = await fetchPinRow(tripId);
  if (!row) return false;
  const key = await deriveKey(pin, row.salt);
  if (!(await checkVerifier(key, row.verifier))) return false;
  cachedKey = key;
  cachedTripId = tripId;
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
  cachedTripId = null;
}
