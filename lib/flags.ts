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
  simDate: false, // dev builds always allow it; in production switch on per device (lib/simDate.ts)
  notificationsV2: true,
  // Needs supabase/migrations/00039_shift_stretch_nights.sql applied first.
  nightsStepper: true,
  // Phase 2 - all built items on 06/10/2026 at Hadar's request, to be tested live.
  // Turn one off here (or per device: ?test=-name) to roll it back.
  bookingsV2: true,
  // Needs migration 00042 (daily_steps, step_tokens) + the steps-ingest function.
  stepsCounter: true,
  planMyDay: true,
  ideaVotes: false, // skipped (decision 04/10/2026), not built
  budgetV2: true,
  tripOverview: true,
  statsStamps: true,
  icsExport: true,
  backupExport: true,
  mapSheet: true,
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

/**
 * Testing on a phone: `?test=budgetV2,stepsCounter` switches flags on for THIS
 * device only (same localStorage override as above), `?test=-budgetV2` turns
 * one off, `?test=reset` clears every override. Runs as an inline script
 * before first paint, so every screen reads the new value; then the parameter
 * is removed from the address bar. Flags are UI only: what a role can read is
 * still decided by RLS, so a kid turning on budgetV2 sees an empty screen.
 */
export const FLAG_BOOT_SCRIPT = `(function(){try{var u=new URL(location.href);var v=u.searchParams.get("test");if(v===null)return;var k=${JSON.stringify(
  "ourtrip-flags"
)};var known=${JSON.stringify(Object.keys(FLAG_DEFAULTS))};var o={};try{o=JSON.parse(localStorage.getItem(k)||"{}")||{}}catch(e){}if(v==="reset"){o={}}else{v.split(",").forEach(function(s){s=s.trim();var off=s.charAt(0)==="-";if(off)s=s.slice(1);if(known.indexOf(s)>=0)o[s]=!off})}localStorage.setItem(k,JSON.stringify(o));u.searchParams.delete("test");history.replaceState(null,"",u.pathname+u.search+u.hash)}catch(e){}})();`;
