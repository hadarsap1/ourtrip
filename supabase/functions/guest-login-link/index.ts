// Guest sign-in link, asked for from the login screen (migration 00075).
// verify_jwt = false: the caller is not signed in yet - that is the point.
//
// claim_guest_login_link (service role only) decides: an approved, unrevoked
// guest of the active trip, at most once a minute. Then a magic link is
// generated and emailed via Resend, like guest-invite (DECISIONS #17: not
// Supabase's built-in SMTP). The reply is the same whether or not a link
// went out, so the endpoint does not tell anyone who is on the guest list.

import { createClient } from "npm:@supabase/supabase-js@2";

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

// The link goes to the app's /auth/confirm page, which signs in only when the
// guest presses a button. Supabase's own action_link signs in on a plain GET,
// and WhatsApp's link preview spent it before the guest could tap (30/10).
// The origin is the redirect Supabase already checked against its allow list,
// never the raw redirect_to from the request.
function confirmUrl(props?: { hashed_token?: string; redirect_to?: string }): string | null {
  if (!props?.hashed_token || !props.redirect_to) return null;
  try {
    const url = new URL("/auth/confirm", new URL(props.redirect_to).origin);
    url.searchParams.set("token_hash", props.hashed_token);
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: { email?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ ok: false, error: "bad input" }, 400);
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: allowed, error: claimError } = await service.rpc("claim_guest_login_link", {
    p_email: email,
  });
  if (claimError) return json({ ok: false, error: "failed" }, 500);
  if (!allowed) {
    console.log("guest-login-link: not sent (not a guest, or asked within the minute)");
    return json({ ok: true });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("guest-login-link: not sent, RESEND_API_KEY is not set");
    return json({ ok: true });
  }

  // approval normally created the auth user; a guest invited before that did not
  const { error: createError } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (createError && !/already|exists/i.test(createError.message)) {
    return json({ ok: false, error: "failed" }, 500);
  }

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: body.redirect_to ?? undefined },
  });
  const link = confirmUrl(linkData?.properties);
  if (linkError || !link) return json({ ok: false, error: "failed" }, 500);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") ?? "OurTrip <onboarding@resend.dev>",
        to: [email],
        subject: "קישור כניסה ל-סו-בב עולם! 🌍",
        html:
          `<div dir="rtl" style="font-family:sans-serif;background:#F7EBD6;color:#3A2C24;padding:24px;border-radius:16px">` +
          `<h2 style="margin:0 0 8px">שלום!</h2>` +
          `<p>ביקשתם קישור כניסה ל"סו-בב עולם!".</p>` +
          `<p><a href="${link}" style="background:#4E6B45;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">כניסה</a></p>` +
          `<p style="color:#6B5A4E;font-size:12px">הקישור אישי ועובד פעם אחת. לא ביקשתם? אפשר להתעלם מהמייל.</p>` +
          `</div>`,
      }),
    });
    console.log(`guest-login-link: resend status ${res.status}`);
  } catch {
    console.log("guest-login-link: resend request failed");
  }
  return json({ ok: true });
});
