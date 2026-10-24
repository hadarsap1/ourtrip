// Dev tool (1.10): pretend today is another date, to test in-trip mode before
// 31/10. `?simDate=YYYY-MM-DD` in the URL sets it for this tab (session
// storage); `?simDate=off` clears it. Active only in development, or on a
// device where the simDate flag is switched on. A banner shows while it is on
// (components/SimDateBanner.tsx) so nobody mistakes it for the real date.

import { isEnabled } from "./flags";

const KEY = "ourtrip-sim-date";
const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function parseSimDate(value: string | null | undefined): string | null | "off" {
  if (!value) return null;
  if (value === "off") return "off";
  if (!ISO.test(value)) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export function simDateAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || isEnabled("simDate");
}

/** The simulated date, or null. Reads the URL once and remembers it per tab. */
export function getSimDate(): string | null {
  if (typeof window === "undefined" || !simDateAllowed()) return null;
  try {
    const fromUrl = parseSimDate(new URLSearchParams(window.location.search).get("simDate"));
    if (fromUrl === "off") window.sessionStorage.removeItem(KEY);
    else if (fromUrl) window.sessionStorage.setItem(KEY, fromUrl);
    return parseSimDate(window.sessionStorage.getItem(KEY)) as string | null;
  } catch {
    return null;
  }
}
