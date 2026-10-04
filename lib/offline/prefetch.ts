// F1 / 1.3: keep the offline-critical set fresh without anyone opening each
// screen. On app start and whenever the connection returns (at most every
// 6 hours unless forced): today's snapshot, the whole itinerary with
// bookings, every emergency page and every phrasebook language the trip has
// (a handful, so "current and next country" is covered by caching them all),
// and every document an owner device can store right now.
// Each step is independent: one failure never stops the others.

const LAST_KEY = "ourtrip-prefetch-at";
const EVERY_MS = 6 * 60 * 60_000;

export function prefetchDue(lastIso: string | null, now: Date, force = false): boolean {
  if (force || !lastIso) return true;
  const last = new Date(lastIso).getTime();
  return Number.isNaN(last) || now.getTime() - last >= EVERY_MS;
}

let running = false;

export async function prefetchOfflineEssentials(force = false): Promise<void> {
  if (running || typeof navigator === "undefined" || !navigator.onLine) return;
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_KEY);
  } catch {
    // storage blocked: just prefetch
  }
  if (!prefetchDue(last, new Date(), force)) return;
  running = true;
  try {
    const { getActiveTrip } = await import("@/lib/data/trip");
    const trip = await getActiveTrip();
    if (!trip) return;
    const steps: Promise<unknown>[] = [
      import("@/lib/data/today").then((m) => m.loadToday()),
      import("@/lib/data/itineraryBundle").then((m) => m.fetchItineraryBundle(trip.id)),
      import("@/lib/data/emergency").then((m) => m.listEmergencyPages(trip.id)),
      import("@/lib/data/phrasebook").then(async (m) => {
        const { languages, fromCache } = await m.listLanguages(trip.id);
        if (fromCache) return;
        for (const lang of languages) await m.listEntries(trip.id, lang);
      }),
      // Documents (F1): owners only. PIN files need no key; the rest only if
      // the vault is open in this session - never written as plaintext.
      (async () => {
        const { getCurrentMember } = await import("@/lib/data/trip");
        if ((await getCurrentMember())?.role !== "owner") return;
        const docsMod = await import("@/lib/data/documents");
        const { getVaultKey } = await import("@/lib/data/docPin");
        const { planDocSync, requestPersistentStorage } = await import("./docSync");
        const [docs, ids] = await Promise.all([docsMod.listDocuments(trip.id), docsMod.listOfflineDocumentIds()]);
        const key = getVaultKey(trip.id);
        const { fetch } = planDocSync(docs, new Set(ids), Boolean(key));
        let landed = 0;
        for (const doc of fetch) {
          try {
            await docsMod.makeAvailableOffline(doc, key);
            landed++;
          } catch {
            // next file; the documents screen shows which one failed
          }
        }
        if (landed + ids.length > 0) await requestPersistentStorage();
      })(),
      // Exchange rates (Phase 2.4): every currency on the route plus USD, so a
      // purchase converts in airplane mode with the last known rate.
      (async () => {
        const [{ listDays }, { currencyForCountry }, { warmFxRates }] = await Promise.all([
          import("@/lib/data/itinerary"),
          import("@/lib/currencies"),
          import("@/lib/data/expenses"),
        ]);
        const days = await listDays(trip.id);
        const codes = [...new Set(days.map((d) => d.country_code).filter(Boolean))] as string[];
        const currencies = codes.map((c) => currencyForCountry(c)).filter((c): c is string => Boolean(c));
        await warmFxRates([...currencies, "USD"]);
      })(),
    ];
    const results = await Promise.allSettled(steps);
    if (results.every((r) => r.status === "fulfilled")) {
      try {
        window.localStorage.setItem(LAST_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    }
  } finally {
    running = false;
  }
}
