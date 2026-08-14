// Sign-out (audit P-1).
//
// SPEC §2.5 permits caching documents unencrypted on the device — "device-level
// security assumed" — on the explicit condition that they are wiped on logout.
// So signing out is not just dropping the Supabase session: everything this
// device learned about the trip has to go with it, or handing a phone to
// someone (or losing it) leaks the vault the vault-lock was built to protect.
//
// Order matters. Local state is destroyed BEFORE the network call, so a
// sign-out started with no connectivity still wipes the device — the session
// token is worthless without the server anyway, and a half-wipe that leaves
// documents behind is the failure mode that actually costs something.

import { getSupabase } from "@/lib/supabase";
import { lockVault } from "@/lib/data/docPin";
import { forgetKidDevice } from "@/lib/data/kids";
import { clearTripCache } from "@/lib/data/trip";
import { OFFLINE_DB_NAME, closeOfflineDB } from "@/lib/offline/db";

/** localStorage keys the app writes. Prefix-matched so per-trip and
 *  per-location keys (doc PIN salt, weather cache) are covered too. */
const LOCAL_KEY_PREFIXES = [
  "ourtrip-docpin-", // documents PIN salt + verifier
  "ourtrip-weather-", // cached forecasts (carries the trip's coordinates)
  "ourtrip-last-currency",
  "ourtrip-kid-", // device token + kid name
];

function wipeLocalStorage(): void {
  try {
    const doomed = Object.keys(localStorage).filter((key) =>
      LOCAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    );
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // private mode / storage disabled — nothing cached, nothing to wipe
  }
}

/** Deletes the whole offline database rather than emptying each store, so a
 *  store added later can never be forgotten here. */
function wipeOfflineDB(): Promise<void> {
  closeOfflineDB();
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME);
    // `blocked` fires when another tab still holds the DB open. We resolve
    // anyway: the delete is queued and completes when that tab closes, and
    // hanging the sign-out button on a background tab is worse.
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function wipeCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // cache API unavailable — the shell holds no trip data anyway
  }
}

/**
 * Signs out and wipes every trace of the trip from this device: offline
 * documents, today's itinerary, emergency pages, the map snapshot, the
 * phrasebook, the vault key, the kid device binding, and the shell cache.
 *
 * Resolves once the device is clean. Callers should hard-navigate afterwards
 * (`location.replace`) rather than client-route, so no mounted screen keeps
 * rendering state loaded under the old session.
 */
export async function signOutAndWipe(): Promise<void> {
  lockVault();
  clearTripCache();
  forgetKidDevice();
  wipeLocalStorage();

  await Promise.all([wipeOfflineDB(), wipeCaches()]);

  const supabase = getSupabase();
  if (supabase) {
    // Best-effort: offline, or an already-expired session, must not leave the
    // device half-wiped — the local state above is already gone.
    await supabase.auth.signOut().catch(() => {});
  }
}
