// A friend's tablet (migration 00110, DECISIONS #79). Two actions:
//
//   create-code  (owner JWT required - checked in-function)
//     owner picks a family kid + the friend's name → one-time 8-char code,
//     48 hours. Only its SHA-256 is stored.
//   redeem       (unauthenticated by design: the tablet has no JWT yet)
//     code + a PIN the friend's family chooses → a guest member for the
//     friend, bound to this device exactly like a kid's tablet. Every later
//     entry is kid-auth `unlock` (PIN, lockout, fresh one-time password).
//
// Wrong codes share the kid codes' project-wide cap (00108). Deployed with
// verify_jwt=false because redeem is pre-auth by nature.
//
// The helpers below are kid-auth's: a function is deployed on its own.

import { createClient } from "npm:@supabase/supabase-js@2";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
// longer than a kid's 6: it lives 48 hours, not 15 minutes. The length is also
// how the tablet tells the two apart (lib/friendCode.ts).
const CODE_LENGTH = 8;
const CODE_TTL_HOURS = 48;
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
}

/** 256 bits of randomness, hex encoded - device tokens and auth passwords. */
function randomSecret(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

async function derivePin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${toHex(salt)}:${await derivePin(pin, salt)}`;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Browser calls this cross-origin (Vercel -> *.supabase.co), so every response
// - including the CORS preflight - must carry these headers. Without them the
// function still runs and still writes to the database; the browser simply
// refuses to hand the reply to the page, so supabase-js reports a network
// failure and the screen shows a generic "try again" that no retry can fix.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

/** Resolves the caller to an owner member id, or null. */
async function ownerCaller(req: Request): Promise<string | null> {
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const [{ data: role }, { data: callerId }] = await Promise.all([
    caller.rpc("current_member_role"),
    caller.rpc("current_member_id"),
  ]);
  return role === "owner" && callerId ? (callerId as string) : null;
}

function failed(step: string, detail?: string | null): Response {
  console.error(`friend-auth: ${step}: ${detail ?? "unknown"}`);
  return json({ ok: false, error: step }, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---------- create-code (owner only) ----------
  if (text("action") === "create-code") {
    const callerId = await ownerCaller(req);
    if (!callerId) return json({ ok: false, error: "forbidden" }, 403);

    const friendName = text("friend_name");
    if (friendName.length < 1 || friendName.length > 60) {
      return json({ ok: false, error: "bad name" }, 400);
    }
    const labels = Array.isArray(body.labels)
      ? body.labels.filter((l): l is string => typeof l === "string" && l.trim() !== "").slice(0, 10)
      : [];

    const [{ data: kid }, { data: owner }] = await Promise.all([
      service.from("members").select("id, trip_id, role, is_preview").eq("id", text("kid_member_id")).maybeSingle(),
      service.from("members").select("trip_id").eq("id", callerId).maybeSingle(),
    ]);
    if (!kid || kid.role !== "kid" || kid.is_preview || !owner || kid.trip_id !== owner.trip_id) {
      return json({ ok: false, error: "bad member" }, 400);
    }

    const code = randomCode();
    const { error } = await service.from("friend_links").insert({
      trip_id: kid.trip_id,
      kid_member_id: kid.id,
      friend_name: friendName,
      labels,
      code_hash: await sha256Hex(code),
      expires_at: new Date(Date.now() + CODE_TTL_HOURS * 3600_000).toISOString(),
      created_by: callerId,
    });
    if (error) return failed("link_insert_failed", error.message);

    return json({ ok: true, code, expires_in_hours: CODE_TTL_HOURS });
  }

  // ---------- redeem (the friend's tablet) ----------
  if (text("action") === "redeem") {
    const code = text("code").toUpperCase();
    const pin = text("pin");
    if (code.length !== CODE_LENGTH) return json({ ok: false, error: "bad code" }, 400);
    if (!/^\d{4,6}$/.test(pin)) return json({ ok: false, error: "bad pin" }, 400);

    const { data: allowed, error: gateError } = await service.rpc("kid_register_allowed");
    if (gateError) return failed("register_gate_failed", gateError.message);
    if (allowed !== true) return json({ ok: false, error: "too_many_attempts" }, 429);

    const codeHash = await sha256Hex(code);
    const { data: link } = await service
      .from("friend_links")
      .select("id")
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!link) {
      await service.rpc("kid_register_failed");
      return json({ ok: false, error: "invalid code" }, 401);
    }

    // the address is made up and never mailed; the shape is the one kid-auth
    // `unlock` signs in with
    const memberId = crypto.randomUUID();
    const email = `kid-${memberId}@kids.ourtrip.app`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: randomSecret(),
      email_confirm: true,
    });
    if (createError || !created.user) return failed("create_user_failed", createError?.message);

    const deviceToken = randomSecret();
    const { data: friendName, error: redeemError } = await service.rpc("friend_redeem", {
      p_code_hash: codeHash,
      p_member_id: memberId,
      p_auth_user_id: created.user.id,
      p_email: email,
      p_device_token_hash: await sha256Hex(deviceToken),
      p_pin_hash: await hashPin(pin),
    });
    if (redeemError || !friendName) {
      // nothing was written; the account made for it goes too
      await service.auth.admin.deleteUser(created.user.id);
      if (redeemError) return failed("redeem_failed", redeemError.message);
      return json({ ok: false, error: "invalid code" }, 401);
    }

    return json({
      ok: true,
      device_token: deviceToken,
      member: { id: memberId, display_name: friendName },
    });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
