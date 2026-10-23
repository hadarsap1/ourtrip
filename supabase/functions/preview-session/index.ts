// "View as a guest / as a kid" (migration 00068). Parents only (checked
// in-function). Signs in the trip's test guest or test kid - creating it on
// first use - and returns that session, so the parent's phone switches to a
// REAL guest or kid session: every read goes through the same RLS the role
// gets, nothing is simulated in the client.
//
//   test guest  a guests_allowlist row like any guest, address on
//               preview.ourtrip.app (no mailbox). Its groups are set on every
//               entry from what the parent picked, so group content can be
//               checked one class at a time.
//   test kid    a kid_devices row like any kid (00024 needs one to resolve),
//               whose token nobody holds: no tablet can unlock it.
//
// Both sign in with a password rotated on every entry and never returned -
// the way kid-auth mints a kid session - so there is no standing credential.
// Going back to the parent happens in the client: it kept the parent's own
// session aside and restores it.

import { createClient } from "npm:@supabase/supabase-js@2";

const PREVIEW_DOMAIN = "preview.ourtrip.app";
const NAMES = { guest: "🧪 אורח בדיקה", kid: "🧪 ילד בדיקה" } as const;

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

function randomHex(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Role = keyof typeof NAMES;
type ServiceClient = ReturnType<typeof createClient>;

/** The auth user for this address, created if missing, with a fresh password. */
async function authUserWithPassword(
  service: ServiceClient,
  email: string,
  knownId: string | null,
  password: string
): Promise<string> {
  if (knownId) {
    const { error } = await service.auth.admin.updateUserById(knownId, { password });
    if (error) throw new Error(error.message);
    return knownId;
  }
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return created.user.id;
  if (error && !/already|exists/i.test(error.message)) throw new Error(error.message);
  // an earlier entry created the user and failed before linking it
  for (let page = 1; page <= 20; page++) {
    const { data, error: listError } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw new Error(listError.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      const { error: updateError } = await service.auth.admin.updateUserById(found.id, { password });
      if (updateError) throw new Error(updateError.message);
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error("preview user missing");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { role?: string; labels?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const role = body.role as Role;
  if (role !== "guest" && role !== "kid") return json({ ok: false, error: "bad role" }, 400);
  const labels = [
    ...new Set(
      (Array.isArray(body.labels) ? body.labels : [])
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim().slice(0, 40))
        .filter(Boolean)
    ),
  ].slice(0, 10);

  // owner gate
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const [{ data: callerRole }, { data: callerId }] = await Promise.all([
    caller.rpc("current_member_role"),
    caller.rpc("current_member_id"),
  ]);
  if (callerRole !== "owner" || !callerId) return json({ ok: false, error: "forbidden" }, 403);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: owner } = await service.from("members").select("trip_id").eq("id", callerId).single();
  if (!owner) return json({ ok: false, error: "forbidden" }, 403);
  const tripId = owner.trip_id as string;
  const email = `preview-${role}-${tripId}@${PREVIEW_DOMAIN}`;

  try {
    const { data: existing } = await service
      .from("members")
      .select("id, auth_user_id")
      .eq("trip_id", tripId)
      .eq("role", role)
      .eq("is_preview", true)
      .maybeSingle();

    const password = randomHex();
    const authUserId = await authUserWithPassword(service, email, existing?.auth_user_id ?? null, password);

    let memberId = existing?.id as string | undefined;
    if (!memberId) {
      const { data: inserted, error } = await service
        .from("members")
        .insert({
          trip_id: tripId,
          // a guest is matched to its allowlist row by address; a kid has none
          email: role === "guest" ? email : null,
          display_name: NAMES[role],
          role,
          is_preview: true,
          auth_user_id: authUserId,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "member insert failed");
      memberId = inserted.id as string;
    } else if (!existing?.auth_user_id) {
      await service.from("members").update({ auth_user_id: authUserId }).eq("id", memberId);
    }

    if (role === "guest") {
      const { error } = await service.from("guests_allowlist").upsert(
        { trip_id: tripId, email, invited_by: callerId, revoked_at: null, labels },
        { onConflict: "trip_id,email" }
      );
      if (error) throw new Error(error.message);
    } else {
      const { count } = await service
        .from("kid_devices")
        .select("id", { count: "exact", head: true })
        .eq("member_id", memberId)
        .is("revoked_at", null);
      if ((count ?? 0) === 0) {
        // a binding nobody can unlock: the token is never kept, and the PIN
        // hash is two random values in the stored "salt:hash" shape
        const { error } = await service.from("kid_devices").insert({
          member_id: memberId,
          device_token_hash: await sha256Hex(randomHex()),
          pin_hash: `${randomHex(16)}:${randomHex()}`,
          approved_by: callerId,
        });
        if (error) throw new Error(error.message);
      }
    }

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.session) throw new Error(signInError?.message ?? "sign-in failed");

    return json({
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      member: { id: memberId, display_name: NAMES[role] },
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
