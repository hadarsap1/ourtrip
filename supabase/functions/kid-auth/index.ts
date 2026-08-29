// Kid device auth (SPEC 2.9, ROADMAP Sprint 6). Four actions:
//
//   create-registration  (owner JWT required — checked in-function)
//     owner picks a kid member + PIN → one-time 6-char code, 15 min expiry
//   register             (unauthenticated by design: the tablet has no JWT yet)
//     code → binds the device: returns a 256-bit device token, revokes
//     previous devices
//   unlock               (unauthenticated by design: PIN gate happens here)
//     device_token + PIN → server-side PIN check with lockout (5 wrong PINs
//     → 15 min lock, persisted in kid_devices) → real Supabase session, so
//     refresh/realtime/storage all work normally
//   revoke               (owner JWT required — checked in-function)
//     cuts a device off for good
//
// SECURITY NOTE (review 2026-08, finding H1). The device token used to BE the
// kid's Supabase auth password, and it is stored in plaintext localStorage on
// the tablet. Since the anon key ships to every browser, anyone holding the
// device could read the token and call signInWithPassword directly — walking
// straight past the PIN prompt, the attempt counter and the 15-minute
// lockout, all of which live in the `unlock` branch below.
//
// The token and the password are now separate secrets:
//   * the device token identifies the device to THIS function, and is stored
//     only as a SHA-256 hash;
//   * the auth password is random, never leaves the server, and is rotated to
//     a fresh value on every unlock — it exists just long enough to mint one
//     session, so there is no standing password for a stolen token to use.
// Revocation additionally rotates it to a value nobody knows, and migration
// 00024 makes `current_member_id()` refuse to resolve a kid whose device is
// revoked, so an already-issued session stops seeing rows on its next query.
//
// Deployed with verify_jwt=false because register/unlock are pre-auth by
// nature; security comes from the one-time code, the 256-bit device token,
// and the rate-limited PIN (documented in docs/SECURITY-CHECKS.md).

import { createClient } from "npm:@supabase/supabase-js@2";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
}

/** 256 bits of randomness, hex encoded — device tokens and auth passwords. */
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

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expected] = stored.split(":");
  if (!saltHex || !expected) return false;
  const actual = await derivePin(pin, fromHex(saltHex));
  // constant-time compare
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function kidEmail(memberId: string): string {
  return `kid-${memberId}@kids.ourtrip.app`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ServiceClient = ReturnType<typeof createClient>;

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

/**
 * Points the kid's auth user at a brand-new random password and returns it.
 * Callers either consume it immediately (unlock) or throw it away, which is
 * what makes a credential unusable (register, revoke).
 */
async function rotateAuthPassword(
  service: ServiceClient,
  authUserId: string
): Promise<string> {
  const password = randomSecret();
  const { error } = await service.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new Error(error.message);
  return password;
}

Deno.serve(async (req) => {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---------- create-registration (owner only) ----------
  if (body.action === "create-registration") {
    const callerId = await ownerCaller(req);
    if (!callerId) return json({ ok: false, error: "forbidden" }, 403);

    const pin = body.pin ?? "";
    if (!/^\d{4,6}$/.test(pin)) {
      return json({ ok: false, error: "bad pin" }, 400);
    }

    // the kid must belong to the same trip as the calling owner
    const { data: kid } = await service
      .from("members")
      .select("id, trip_id, role, display_name")
      .eq("id", body.member_id ?? "")
      .maybeSingle();
    const { data: owner } = await service
      .from("members")
      .select("trip_id")
      .eq("id", callerId)
      .maybeSingle();
    if (!kid || kid.role !== "kid" || !owner || kid.trip_id !== owner.trip_id) {
      return json({ ok: false, error: "bad member" }, 400);
    }

    const code = randomCode();
    const { error } = await service.from("kid_device_registrations").insert({
      member_id: kid.id,
      code_hash: await sha256Hex(code),
      pin_hash: await hashPin(pin),
      created_by: callerId,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, code, expires_in_minutes: CODE_TTL_MS / 60000 });
  }

  // ---------- register (tablet redeems a code) ----------
  if (body.action === "register") {
    const code = (body.code ?? "").trim().toUpperCase();
    if (code.length < 6) return json({ ok: false, error: "bad code" }, 400);

    const { data: registration } = await service
      .from("kid_device_registrations")
      .select("*")
      .eq("code_hash", await sha256Hex(code))
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!registration) return json({ ok: false, error: "invalid code" }, 401);

    const { data: member } = await service
      .from("members")
      .select("id, display_name, auth_user_id")
      .eq("id", registration.member_id)
      .single();
    if (!member) return json({ ok: false, error: "member missing" }, 500);

    // The token the tablet keeps. It is NOT the auth password — it only ever
    // identifies the device to this function, and is stored hashed.
    const deviceToken = randomSecret();
    const email = kidEmail(member.id);

    if (member.auth_user_id) {
      // rotate to a fresh server-only password; nothing else may use the old one
      try {
        await rotateAuthPassword(service, member.auth_user_id);
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 500);
      }
    } else {
      const { data: created, error } = await service.auth.admin.createUser({
        email,
        password: randomSecret(),
        email_confirm: true,
      });
      if (error || !created.user) {
        return json({ ok: false, error: error?.message ?? "createUser failed" }, 500);
      }
      const { error: linkError } = await service
        .from("members")
        .update({ auth_user_id: created.user.id })
        .eq("id", member.id);
      if (linkError) return json({ ok: false, error: linkError.message }, 500);
    }

    // Insert the new binding BEFORE revoking the old ones: since 00024 a kid
    // with zero active devices cannot resolve as a member at all, and doing it
    // the other way round opens a window where in-flight requests see nothing.
    const { data: device, error: deviceError } = await service
      .from("kid_devices")
      .insert({
        member_id: member.id,
        device_token_hash: await sha256Hex(deviceToken),
        pin_hash: registration.pin_hash,
        approved_by: registration.created_by,
      })
      .select("id")
      .single();
    if (deviceError || !device) {
      return json({ ok: false, error: deviceError?.message ?? "insert failed" }, 500);
    }

    // one active device per kid
    await service
      .from("kid_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("member_id", member.id)
      .neq("id", device.id)
      .is("revoked_at", null);

    await service
      .from("kid_device_registrations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", registration.id);

    return json({
      ok: true,
      device_token: deviceToken,
      member: { id: member.id, display_name: member.display_name },
    });
  }

  // ---------- unlock (PIN → session) ----------
  if (body.action === "unlock") {
    const deviceToken = body.device_token ?? "";
    const pin = body.pin ?? "";
    if (!deviceToken || !pin) return json({ ok: false, error: "bad request" }, 400);

    const { data: device } = await service
      .from("kid_devices")
      .select("*")
      .eq("device_token_hash", await sha256Hex(deviceToken))
      .is("revoked_at", null)
      .maybeSingle();
    if (!device) return json({ ok: false, error: "unknown device" }, 401);

    if (device.locked_until && new Date(device.locked_until) > new Date()) {
      return json(
        { ok: false, error: "locked", locked_until: device.locked_until },
        423
      );
    }

    const pinOk = await verifyPin(pin, device.pin_hash);
    if (!pinOk) {
      const attempts = device.failed_attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(
          Date.now() + LOCK_MINUTES * 60 * 1000
        ).toISOString();
        await service
          .from("kid_devices")
          .update({ failed_attempts: 0, locked_until: lockedUntil })
          .eq("id", device.id);
        return json({ ok: false, error: "locked", locked_until: lockedUntil }, 423);
      }
      await service
        .from("kid_devices")
        .update({ failed_attempts: attempts })
        .eq("id", device.id);
      return json(
        { ok: false, error: "wrong pin", attempts_left: MAX_ATTEMPTS - attempts },
        401
      );
    }

    await service
      .from("kid_devices")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("id", device.id);

    const { data: member } = await service
      .from("members")
      .select("id, display_name, auth_user_id")
      .eq("id", device.member_id)
      .single();
    if (!member?.auth_user_id) {
      return json({ ok: false, error: "member missing" }, 500);
    }

    // The PIN has been proven, so mint a session: set a fresh single-use
    // password and consume it right away. Nothing persists that a stolen
    // device token could later replay against signInWithPassword.
    let oneTimePassword: string;
    try {
      oneTimePassword = await rotateAuthPassword(service, member.auth_user_id);
    } catch (err) {
      return json({ ok: false, error: (err as Error).message }, 500);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } }
    );
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: kidEmail(member.id),
      password: oneTimePassword,
    });
    if (signInError || !signIn.session) {
      return json({ ok: false, error: signInError?.message ?? "sign-in failed" }, 500);
    }

    return json({
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      member: { id: member.id, display_name: member.display_name },
    });
  }

  // ---------- revoke (owner only) ----------
  // Marking revoked_at is now enough to stop RLS resolving the kid (00024),
  // but rotating the password as well means the binding can never mint a new
  // session either — belt and braces, and it makes the revocation independent
  // of any one policy staying correct.
  if (body.action === "revoke") {
    const callerId = await ownerCaller(req);
    if (!callerId) return json({ ok: false, error: "forbidden" }, 403);

    const { data: device } = await service
      .from("kid_devices")
      .select("id, member_id")
      .eq("id", body.device_id ?? "")
      .maybeSingle();
    if (!device) return json({ ok: false, error: "unknown device" }, 404);

    // the device's kid must be on the calling owner's trip
    const { data: kid } = await service
      .from("members")
      .select("id, trip_id, auth_user_id")
      .eq("id", device.member_id)
      .maybeSingle();
    const { data: owner } = await service
      .from("members")
      .select("trip_id")
      .eq("id", callerId)
      .maybeSingle();
    if (!kid || !owner || kid.trip_id !== owner.trip_id) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const { error } = await service
      .from("kid_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", device.id)
      .is("revoked_at", null);
    if (error) return json({ ok: false, error: error.message }, 500);

    // Only rotate once the kid has no active device left — otherwise revoking
    // an old binding would break the current one's next unlock.
    const { count } = await service
      .from("kid_devices")
      .select("id", { count: "exact", head: true })
      .eq("member_id", kid.id)
      .is("revoked_at", null);
    if ((count ?? 0) === 0 && kid.auth_user_id) {
      try {
        await rotateAuthPassword(service, kid.auth_user_id);
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 500);
      }
    }

    return json({ ok: true });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
