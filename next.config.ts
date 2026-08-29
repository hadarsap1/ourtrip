import type { NextConfig } from "next";

// Security headers (security review 2026-08, finding M6 — the config was
// previously empty). Applied to every route.
//
// The four enforced headers below are zero-risk for this app and each closes
// something real for a PWA that holds passports and runs a Google Maps key in
// the browser:
//
//   Permissions-Policy   geolocation is the app's most sensitive capability.
//                        Restricting it to `self` means an embedded third
//                        party can never prompt for the family's location.
//                        Camera stays available for photo capture; the
//                        microphone is never used, so it is denied outright.
//   Referrer-Policy      without it the full URL — and therefore which screen
//                        and sometimes which record is open — rides along in
//                        the Referer to Google, OSM and Open-Meteo on every
//                        map, geocode and weather call.
//   X-Frame-Options +    the photo-approval screen is a one-tap action that
//   frame-ancestors      decides what guests can see; framing it elsewhere is
//                        a clickjacking target. Both are set because coverage
//                        differs across browsers.
//   X-Content-Type-Options  documents are served as user-supplied PDFs and
//                        images; never let a browser sniff its way to a
//                        different type.
//
// HSTS is deliberately absent: Vercel already sends it for the deployment
// domain, and setting max-age from the app risks pinning a custom domain
// before its certificate story is settled.
//
// CSP ships REPORT-ONLY on purpose. A real policy has to accommodate the
// Google Maps JS API, Google Identity Services and Next's inline bootstrap,
// and getting that wrong takes the app down rather than degrading it.
// Report-only surfaces violations in the browser console with no user impact —
// load the map, the photos screen and the recommendations screen, read what it
// complains about, tighten, then switch the header name to
// Content-Security-Policy. It is a tuning aid until then, not protection.
//
// The origin list below was derived by grepping every external URL the client
// code actually reaches, not guessed. Worth keeping that way: the Google
// Photos picker pulls accounts.google.com/gsi/client as a SCRIPT and runs its
// token flow in an IFRAME, so an enforced policy without those directives
// would silently break photo import — the kind of breakage that only shows up
// the first time someone tries to use it.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next injects inline bootstrap; Google Maps loads its own chunks;
  // accounts.google.com is Google Identity Services, for the Photos picker
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Supabase storage (signed URLs), Google Maps tiles, gphotos cache, blob: for
  // decrypted documents and object URLs
  "img-src 'self' data: blob: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com",
  // Supabase REST/realtime/storage, weather, FX, OSM, Google (Maps + the GIS
  // token endpoint the Photos picker calls)
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://open.er-api.com https://api.frankfurter.dev https://nominatim.openstreetmap.org https://overpass-api.de https://maps.googleapis.com https://accounts.google.com https://www.googleapis.com",
  // GIS runs its OAuth token flow in an iframe
  "frame-src 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(self), microphone=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
