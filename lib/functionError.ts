// Reads the error CODE an Edge Function returned in its JSON body.
//
// Why this exists: supabase-js does not put the response body in the Error it
// hands back. A non-2xx reply becomes a FunctionsHttpError whose `.message` is
// the generic "Edge Function returned a non-2xx status code", with the real
// body reachable only through `.context` (the raw Response). Code that did
//
//     if (error) throw new Error(error.message);   // ...then compared to "not_configured"
//
// could therefore never match a specific code, so every failure — a missing
// API key, an exhausted balance, a genuine transient error — surfaced as the
// same "try again" message. Retrying does not help two of those three.
//
// The body shape is the one every function here returns: { ok: false, error }.

type MaybeHttpError = { context?: unknown } & Error;

function isResponseLike(v: unknown): v is Response {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Response).json === "function" &&
    typeof (v as Response).status === "number"
  );
}

/** The function's own error code (e.g. "not_configured", "no_credit",
 *  "forbidden"), or null when the failure carried no structured body —
 *  a network drop, a timeout, or a non-JSON reply. */
export async function functionErrorCode(error: unknown): Promise<string | null> {
  if (!error) return null;

  const ctx = (error as MaybeHttpError).context;
  if (isResponseLike(ctx)) {
    try {
      // .clone() so a caller that also wants to read the body still can.
      const body = await ctx.clone().json();
      const code = (body as { error?: unknown })?.error;
      return typeof code === "string" ? code : null;
    } catch {
      return null;
    }
  }

  // Some paths (our own throws, the 45s timeout race) carry the code directly.
  const msg = (error as Error)?.message;
  return typeof msg === "string" && msg !== "" ? msg : null;
}
