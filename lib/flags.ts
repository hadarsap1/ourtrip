// Feature flags (upgrade plan, docs/upgrade/PLAN.md).
//
// Typed config, no database table: a change ships with a deploy. Defaults follow
// the phase rule - Phase 0/1 on, Phase 2 on once its tests pass, Phase 3 off.
// A device can override any flag for testing via localStorage
// ("ourtrip-flags" = JSON of { key: boolean }); the override never leaves the
// device and is ignored during server render.

export const FLAG_DEFAULTS = {
  // Phase 0
  themeSwitch: true,
  offlineStatus: true,
  routeSkeletons: true,
  countryPicker: true,
  // Phase 1
  documentsAutoDownload: true,
  writeQueueV2: true,
  itineraryV2: true,
  todayV2: true,
  captureFab: true,
  emergencyAutoCountry: true,
  simDate: true, // also requires dev mode or this flag; see lib/simDate.ts
  notificationsV2: true,
  // Phase 2 (flip after tests pass)
  bookingsV2: false,
  planMyDay: false,
  ideaVotes: false,
  budgetV2: false,
  tripOverview: false,
  statsStamps: false,
  icsExport: false,
  backupExport: false,
  mapSheet: false,
  // Phase 3 (off by default)
  cameraTranslate: false,
  receiptScan: false,
  assistant: false,
  offlineMapSnapshots: false,
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;

const STORAGE_KEY = "ourtrip-flags";

function readOverrides(): Partial<Record<FlagKey, boolean>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<FlagKey, boolean>> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k in FLAG_DEFAULTS && typeof v === "boolean") out[k as FlagKey] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function isEnabled(key: FlagKey, overrides = readOverrides()): boolean {
  return overrides[key] ?? FLAG_DEFAULTS[key];
}

export function setFlagOverride(key: FlagKey, value: boolean | null): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readOverrides() };
    if (value === null) delete next[key];
    else next[key] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: overrides are a testing aid only.
  }
}
