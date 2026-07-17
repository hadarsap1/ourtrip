// Guest invitation (SPEC 2.10, DECISIONS #17). Owner-gated (in-function).
// Adds/re-activates the allowlist row + guest member, ensures an auth user,
// and generates a magic sign-in link. If RESEND_API_KEY is configured the
// link is emailed via Resend (custom SMTP per DECISIONS #17 — Supabase's
// built-in SMTP is rate-limited); otherwise the link is returned to the
// owner UI for manual sharing (WhatsApp etc.) — the feature degrades,
// never blocks.

import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  let body: { email?: string; display_name?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.display_name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName) {
    return json({ ok: false, error: "bad input" }, 400);
  }

  // owner gate
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const [{ data: role }, { data: callerId }] = await Promise.all([
    caller.rpc("current_member_role"),
    caller.rpc("current_member_id"),
  ]);
  if (role !== "owner" || !callerId) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: trip } = await service
    .from("trips")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!trip) return json({ ok: false, error: "no active trip" }, 409);

  // never grant guest role over an existing owner/kid member
  const { data: existingMember } = await service
    .from("members")
    .select("id, role")
    .eq("trip_id", trip.id)
    .ilike("email", email)
    .maybeSingle();
  if (existingMember && existingMember.role !== "guest") {
    return json({ ok: false, error: "email belongs to a family member" }, 400);
  }

  // allowlist upsert: re-inviting clears a previous revocation
  const { error: allowlistError } = await service.from("guests_allowlist").upsert(
    {
      trip_id: trip.id,
      email,
      invited_by: callerId,
      revoked_at: null,
    },
    { onConflict: "trip_id,email" }
  );
  if (allowlistError) return json({ ok: false, error: allowlistError.message }, 500);

  if (!existingMember) {
    const { error } = await service.from("members").insert({
      trip_id: trip.id,
      email,
      display_name: displayName,
      role: "guest",
    });
    if (error) return json({ ok: false, error: error.message }, 500);
  }

  // auth user must exist before a magiclink can be generated
  const { error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError && !/already|exists/i.test(createError.message)) {
    return json({ ok: false, error: createError.message }, 500);
  }

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: body.redirect_to ?? undefined },
  });
  if (linkError || !linkData.properties?.action_link) {
    return json({ ok: false, error: linkError?.message ?? "link failed" }, 500);
  }
  const link = linkData.properties.action_link;

  // optional email delivery via Resend
  let emailed = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM") ?? "OurTrip <onboarding@resend.dev>",
          to: [email],
          subject: "הוזמנתם לעקוב אחרי הטיול שלנו! 🌍",
          html:
            `<div dir="rtl" style="font-family:sans-serif">` +
            `<h2>שלום ${displayName}!</h2>` +
            `<p>הוזמנתם לפורטל הטיול המשפחתי שלנו — תמונות, יומן מסע ומפה.</p>` +
            `<p><a href="${link}" style="background:#0d9488;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">כניסה לפורטל</a></p>` +
            `<p style="color:#64748b;font-size:12px">הקישור אישי — לא להעביר הלאה.</p>` +
            `</div>`,
        }),
      });
      emailed = res.ok;
    } catch {
      emailed = false;
    }
  }

  return json({ ok: true, link, emailed });
});
