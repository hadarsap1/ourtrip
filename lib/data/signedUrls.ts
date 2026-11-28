import { getSupabase, onSignedOut } from "@/lib/supabase";

// Signed URLs already handed out this session, by bucket + storage path
// (egress fix, 24/11/2026). A fresh token on every list load gave every <img>
// a new address, so the browser downloaded the same photo again each time a
// screen opened - ~22 downloads per photo per day. Reusing the URL while it is
// still good lets the browser (and the service worker's media cache) serve it.
// Paths are random UUIDs that are never overwritten, so a path always names
// the same bytes. Only what RLS already let this client sign is kept here.
const signedCache = new Map<string, { url: string; expiresAt: number }>();
// a reused URL must outlive the screen that shows it
export const REUSE_MARGIN_MS = 10 * 60 * 1000;

// sign-out drops them, so the next account on the device signs its own
onSignedOut(() => signedCache.clear());

/** Which of `paths` already have a live URL, and which still need signing. */
export function splitCached(
  bucket: string,
  paths: string[],
  now: number
): { hits: Map<string, string>; missing: string[] } {
  const hits = new Map<string, string>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = signedCache.get(`${bucket}:${path}`);
    if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) hits.set(path, hit.url);
    else missing.push(path);
  }
  return { hits, missing };
}

/** Remembers a URL signed at `now` for `ttlSeconds`. */
export function rememberSigned(bucket: string, path: string, url: string, now: number, ttlSeconds: number): void {
  signedCache.set(`${bucket}:${path}`, { url, expiresAt: now + ttlSeconds * 1000 });
}

/** Drops a URL that failed to load (expired while a screen stayed open), so
 *  the next signing makes a new one instead of handing it out again. */
export function forgetSignedUrl(url: string): void {
  for (const [key, hit] of signedCache) if (hit.url === url) signedCache.delete(key);
}

/** Test hook. */
export function clearSignedCache(): void {
  signedCache.clear();
}

/** Signed URLs for `paths` in a private `bucket`, reusing live ones. */
export async function signPaths(
  bucket: string,
  paths: string[],
  ttlSeconds: number
): Promise<Map<string, string | null>> {
  const now = Date.now();
  const { hits, missing } = splitCached(bucket, paths, now);
  const out = new Map<string, string | null>(hits);
  if (missing.length > 0) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("supabase not configured");
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(missing, ttlSeconds);
    for (const s of signed ?? []) {
      if (!s.path) continue;
      out.set(s.path, s.signedUrl ?? null);
      if (s.signedUrl) rememberSigned(bucket, s.path, s.signedUrl, now, ttlSeconds);
    }
  }
  return out;
}
