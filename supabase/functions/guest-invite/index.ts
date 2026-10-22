// Guest invitation (SPEC 2.10, DECISIONS #17). Owner-gated (in-function).
// Adds/re-activates the allowlist row + guest member, ensures an auth user,
// and generates a magic sign-in link. If RESEND_API_KEY is configured the
// link is emailed via Resend (custom SMTP per DECISIONS #17 - Supabase's
// built-in SMTP is rate-limited); otherwise the link is returned to the
// owner UI for manual sharing (WhatsApp etc.) - the feature degrades,
// never blocks.

import { createClient } from "npm:@supabase/supabase-js@2";

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

// The display name is typed by a parent (or pasted from a class list) and
// lands inside an HTML email.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: {
    email?: string;
    display_name?: string;
    redirect_to?: string;
    labels?: unknown;
    /** pre-00061 clients: one group */
    label?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.display_name ?? "").trim();
  // Optional groups (family / a class / friends) - addressing only, no policy
  // reads them (migrations 00043, 00061). They are added to the groups the
  // guest already has, so a re-invite never takes a guest out of a group.
  const rawLabels = Array.isArray(body.labels) ? body.labels : body.label ? [body.label] : [];
  const addLabels = [
    ...new Set(
      rawLabels
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim().slice(0, 40))
        .filter(Boolean)
    ),
  ];
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

  let labels: string[] | undefined;
  if (addLabels.length > 0) {
    const { data: existing } = await service
      .from("guests_allowlist")
      .select("labels")
      .eq("trip_id", trip.id)
      .eq("email", email)
      .maybeSingle();
    labels = [...new Set([...((existing?.labels as string[] | undefined) ?? []), ...addLabels])].slice(0, 10);
  }

  // allowlist upsert: re-inviting clears a previous revocation
  const { error: allowlistError } = await service.from("guests_allowlist").upsert(
    {
      trip_id: trip.id,
      email,
      invited_by: callerId,
      revoked_at: null,
      ...(labels === undefined ? {} : { labels }),
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
          subject: "הוזמנתם לעקוב אחרי סו-בב עולם! 🌍",
          html:
            `<div dir="rtl" style="font-family:sans-serif;background:#F7EBD6;color:#3A2C24;padding:24px;border-radius:16px">` +
            `<h2 style="margin:0 0 8px">שלום ${escapeHtml(displayName)}!</h2>` +
            `<p>הוזמנתם ל"סו-בב עולם!" - הסיפורים, התמונות והפודקאסט של משפחת סו מהדרך.</p>` +
            `<p><a href="${link}" style="background:#4E6B45;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">כניסה</a></p>` +
            `<p style="color:#6B5A4E;font-size:12px">הקישור אישי - לא להעביר הלאה. נכנסים פעם אחת, והטלפון זוכר.</p>` +
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
