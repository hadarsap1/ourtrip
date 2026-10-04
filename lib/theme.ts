// Light / dark / system theme (F7). The preference is per device
// (localStorage "ourtrip-theme"); the resolved theme lives on <html data-theme>.
// THEME_BOOT_SCRIPT runs in <head> before first paint, so there is no flash.

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ourtrip-theme";
// Light keeps the manifest's teal (status bar since launch); dark uses the dark background.
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#0e7c6b", dark: "#111816" };

/** Inline, dependency-free; keep in sync with applyTheme below. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.setAttribute("data-theme-pref",p);}catch(e){}})();`;

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export function readThemePref(): ThemePref {
  try {
    const p = window.localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref, systemDark());
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLORS[resolved]));
  return resolved;
}

const listeners = new Set<() => void>();

/** useSyncExternalStore source for the saved preference. */
export function subscribeThemePref(cb: () => void): () => void {
  listeners.add(cb);
  const stopWatching = watchSystemTheme();
  return () => {
    listeners.delete(cb);
    stopWatching();
  };
}

export function setThemePref(pref: ThemePref): ResolvedTheme {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage blocked: the choice still applies for this session
  }
  const resolved = applyTheme(pref);
  listeners.forEach((l) => l());
  return resolved;
}

/** Keeps "system" in step with the OS while the app is open. Returns a cleanup. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readThemePref() === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
