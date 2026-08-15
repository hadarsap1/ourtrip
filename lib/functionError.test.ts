import { describe, expect, it } from "vitest";
import { functionErrorCode } from "./functionError";

/** Stands in for the FunctionsHttpError supabase-js hands back: a generic
 *  message, with the real body only reachable through `.context`. */
function httpError(body: unknown, status = 500): Error & { context: Response } {
  const err = new Error(
    "Edge Function returned a non-2xx status code"
  ) as Error & { context: Response };
  err.context = new Response(JSON.stringify(body), { status });
  return err;
}

describe("functionErrorCode", () => {
  it("pulls the code out of the response body, not the generic message", async () => {
    const err = httpError({ ok: false, error: "not_configured" }, 503);
    expect(await functionErrorCode(err)).toBe("not_configured");
    // The regression this guards: the message alone reveals nothing.
    expect(err.message).not.toContain("not_configured");
  });

  it("reads the exhausted-balance code", async () => {
    expect(await functionErrorCode(httpError({ error: "no_credit" }, 402))).toBe(
      "no_credit"
    );
  });

  it("leaves the body readable for anyone else (clone, not consume)", async () => {
    const err = httpError({ error: "forbidden" }, 403);
    expect(await functionErrorCode(err)).toBe("forbidden");
    await expect(err.context.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("returns null for a body with no error field", async () => {
    expect(await functionErrorCode(httpError({ ok: true }))).toBeNull();
  });

  it("returns null for a non-JSON body rather than throwing", async () => {
    const err = new Error("boom") as Error & { context: Response };
    err.context = new Response("<html>gateway timeout</html>", { status: 504 });
    expect(await functionErrorCode(err)).toBeNull();
  });

  it("falls back to the message when there is no response context", async () => {
    expect(await functionErrorCode(new Error("timeout"))).toBe("timeout");
  });

  it("returns null for no error at all", async () => {
    expect(await functionErrorCode(null)).toBeNull();
    expect(await functionErrorCode(undefined)).toBeNull();
  });
});
