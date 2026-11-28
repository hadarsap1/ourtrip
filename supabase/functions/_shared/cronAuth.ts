// The cron-secret check for the scheduled functions (push-send, fx-daily,
// guest-digest, backup-weekly). Pure and Deno/Node neutral so vitest covers
// it (cronAuth.test.ts); each function passes its own env value and lookup.
//
// The secret has lived in the database since 00052 (cron_secret_matches,
// service role only). A CRON_SECRET function secret, if one is ever set, is
// compared instead. Fails CLOSED: no header, a wrong one, or a lookup that
// errors twice is a "no".
//
// Why one retry (QA 24/11/2026): about 5% of the lookups came back 401
// PGRST303 (JWT claims rejected) for the same sb_secret_ key that passed the
// other 95%, so a scheduled run was refused for nothing. Only an *error* is
// retried. A clear "false" (wrong secret) is final.

export type SecretLookup = (secret: string) => Promise<{ data: unknown; error: unknown }>;

export const CRON_LOOKUP_RETRY_MS = 400;

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function cronSecretOk(
  got: string | null,
  envSecret: string | undefined,
  lookup: SecretLookup,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  if (!got) return false;
  if (envSecret) return sameText(got, envSecret);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await wait(CRON_LOOKUP_RETRY_MS);
    try {
      const { data, error } = await lookup(got);
      if (!error) return data === true;
    } catch {
      // a thrown lookup counts as an error: retry once, then refuse
    }
  }
  return false;
}
