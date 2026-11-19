// The guests' daily email (00101, DECISIONS #72). Called every hour by pg_cron
// with the shared cron secret; sends only in the 08:00 hour in Israel.
//
// For each guest who asked for it (guest_email_optins): the updates and
// podcast episodes shared with guests since their last email - push-send
// records each one in guest_update_pushes when it opens to guests (00100) -
// that this guest may see NOW (same rule as the guest policies:
// _shared/guestUpdates.ts; a revoked guest gets nothing, an unpublished update
// is left out). Nothing new, no email.
//
// Sent from the family's Gmail over SMTPS, port 465 (Supabase blocks 25 and
// 587), with an app password: secrets GMAIL_USER and GMAIL_APP_PASSWORD.
// Without them it sends nothing. APP_URL is the app's address for the links.
// Kill switch: GUEST_EMAIL=off.
//
// Body: {} from the cron job; {"force": true} skips the hour check;
// {"test": true} sends one sample email, with the three latest items shared
// with guests, to GMAIL_USER itself and to no one else (checking the Gmail
// connection without waiting for 08:00 or writing to any guest).

import { createClient } from "npm:@supabase/supabase-js@2";
import { localNow } from "../_shared/notifyPolicy.ts";
import { GUEST_ZONE, guestUpdateRecipients, type AllowRow, type GuestRow } from "../_shared/guestUpdates.ts";
import { buildDigest, type DigestItem } from "../_shared/guestDigest.ts";
import { buildMessage, smtpSend } from "../_shared/mail.ts";
import { gmailConn } from "../_shared/gmail.ts";

const SEND_HOUR = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// same check as push-send: the cron secret kept in the database (00052), or a
// CRON_SECRET function secret if one is set. Fails closed.
async function cronAuthorized(req: Request): Promise<boolean> {
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!got) return false;
  const expected = Deno.env.get("CRON_SECRET");
  if (expected) {
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  }
  const { data, error } = await service.rpc("cron_secret_matches", { p_secret: got });
  return !error && data === true;
}

type Optin = { member_id: string; trip_id: string; unsubscribe_token: string; last_sent_at: string };

Deno.serve(async (req) => {
  if (!(await cronAuthorized(req))) return json({ ok: false, error: "forbidden" }, 401);
  if (Deno.env.get("GUEST_EMAIL") === "off") return json({ ok: true, skipped: "GUEST_EMAIL=off" });

  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return json({ ok: true, skipped: "GMAIL_USER / GMAIL_APP_PASSWORD not set" });

  let body: { force?: boolean; test?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // the cron job sends {}; an empty body is fine too
  }
  const now = new Date();
  if (body.test) {
    try {
      return json({ ok: true, ...(await sendTest(now, user, pass)) });
    } catch (err) {
      return json({ ok: false, error: (err as Error).message }, 500);
    }
  }
  const hour = Math.floor(localNow(now, GUEST_ZONE).minutes / 60);
  if (!body.force && hour !== SEND_HOUR) return json({ ok: true, skipped: `not ${SEND_HOUR}:00 in Israel` });

  try {
    return json({ ok: true, ...(await run(now, user, pass)) });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

async function run(now: Date, user: string, pass: string) {
  const appUrl = (Deno.env.get("APP_URL") ?? "https://ourtrip-umber.vercel.app").replace(/\/+$/, "");

  const { data: optinRows, error: optErr } = await service
    .from("guest_email_optins")
    .select("member_id, trip_id, unsubscribe_token, last_sent_at");
  if (optErr) throw new Error(optErr.message);
  const optins = (optinRows ?? []) as Optin[];
  if (optins.length === 0) return { guests: 0, sent: 0 };

  const tripIds = [...new Set(optins.map((o) => o.trip_id))];
  // timestamps compared as instants: Postgres and toISOString() spell them differently
  const at = (s: string) => Date.parse(s);
  const since = new Date(Math.min(...optins.map((o) => at(o.last_sent_at)))).toISOString();

  const [{ data: members }, { data: allow }, { data: told }] = await Promise.all([
    service.from("members").select("id, role, email, display_name, trip_id").in("trip_id", tripIds).eq("role", "guest"),
    service.from("guests_allowlist").select("email, labels, trip_id").in("trip_id", tripIds).is("revoked_at", null),
    service.from("guest_update_pushes").select("target_id, kind, trip_id, sent_at").in("trip_id", tripIds).gt("sent_at", since),
  ]);
  const toldRows = (told ?? []) as { target_id: string; kind: "story" | "episode"; trip_id: string; sent_at: string }[];

  // what is still open to guests now, with its audience
  const storyIds = toldRows.filter((t) => t.kind === "story").map((t) => t.target_id);
  const episodeIds = toldRows.filter((t) => t.kind === "episode").map((t) => t.target_id);
  const [{ data: posts }, { data: episodes }] = await Promise.all([
    storyIds.length
      ? service
          .from("posts")
          .select("id, title, audience")
          .in("id", storyIds)
          .eq("status", "approved")
          .in("visibility", ["guests", "public"])
          .or(`publish_after.is.null,publish_after.lte.${now.toISOString()}`)
      : Promise.resolve({ data: [] }),
    episodeIds.length
      ? service.from("episodes").select("id, title").in("id", episodeIds).eq("status", "approved").eq("shared_with_guests", true)
      : Promise.resolve({ data: [] }),
  ]);
  const open = new Map<string, { title: string | null; audience: string[] }>();
  for (const p of (posts ?? []) as { id: string; title: string | null; audience: string[] | null }[]) {
    open.set(p.id, { title: p.title, audience: p.audience ?? [] });
  }
  for (const e of (episodes ?? []) as { id: string; title: string | null }[]) open.set(e.id, { title: e.title, audience: [] });

  const memberRows = (members ?? []) as (GuestRow & { display_name: string; trip_id: string })[];
  const allowRows = (allow ?? []) as (AllowRow & { trip_id: string })[];

  type Outgoing = { optin: Optin; to: string; data: string };
  const outgoing: Outgoing[] = [];
  let quiet = 0;

  for (const o of optins) {
    const m = memberRows.find((r) => r.id === o.member_id && r.trip_id === o.trip_id);
    const tripAllow = allowRows.filter((a) => a.trip_id === o.trip_id);
    // an active guest of this trip, or nothing at all
    if (!m?.email || guestUpdateRecipients([m], tripAllow, { kind: "episode", audience: [] }).length === 0) continue;

    const items: DigestItem[] = toldRows
      .filter((t) => t.trip_id === o.trip_id && at(t.sent_at) > at(o.last_sent_at) && open.has(t.target_id))
      .sort((a, b) => at(a.sent_at) - at(b.sent_at))
      .filter((t) => {
        const item = open.get(t.target_id)!;
        return guestUpdateRecipients([m], tripAllow, { kind: t.kind, audience: item.audience }).length > 0;
      })
      .map((t) => ({ kind: t.kind, id: t.target_id, title: open.get(t.target_id)!.title }));

    // claim this guest's day first: a second run in the same hour finds nothing
    const { data: claimed } = await service
      .from("guest_email_optins")
      .update({ last_sent_at: now.toISOString() })
      .eq("member_id", o.member_id)
      .eq("last_sent_at", o.last_sent_at)
      .select("member_id");
    if (!claimed || claimed.length === 0) continue;
    if (items.length === 0) {
      quiet += 1;
      continue;
    }

    const unsubscribeUrl = `${appUrl}/email-off/${o.unsubscribe_token}`;
    const digest = buildDigest(m.display_name, items, appUrl, unsubscribeUrl);
    const data = buildMessage(
      { name: "סו-בב עולם!", address: user },
      { to: m.email, ...digest },
      { boundary: `ot-${crypto.randomUUID()}`, date: now, messageId: `${crypto.randomUUID()}@ourtrip`, unsubscribeUrl }
    );
    outgoing.push({ optin: o, to: m.email, data });
  }

  if (outgoing.length === 0) return { guests: optins.length, sent: 0, nothingNew: quiet };

  // one connection for all of them; on failure, give the day back so the
  // next run tries again
  let result: { sent: number; failed: { to: string; error: string }[] };
  const conn = await gmailConn().catch(async (err) => {
    await giveBack(outgoing.map((x) => x.optin));
    throw err;
  });
  try {
    result = await smtpSend(conn, { user, pass }, outgoing.map((x) => ({ to: x.to, data: x.data })));
  } catch (err) {
    await giveBack(outgoing.map((x) => x.optin));
    throw err;
  } finally {
    conn.close();
  }
  const failedTo = new Set(result.failed.map((f) => f.to));
  await giveBack(outgoing.filter((x) => failedTo.has(x.to)).map((x) => x.optin));
  // addresses are not echoed back: counts only
  return { guests: optins.length, sent: result.sent, failed: result.failed.length, nothingNew: quiet };
}

/** One sample email to the sending account itself (see the header). */
async function sendTest(now: Date, user: string, pass: string) {
  const appUrl = (Deno.env.get("APP_URL") ?? "https://ourtrip-umber.vercel.app").replace(/\/+$/, "");
  const { data: told } = await service
    .from("guest_update_pushes")
    .select("target_id, kind")
    .order("sent_at", { ascending: false })
    .limit(3);
  const rows = (told ?? []) as { target_id: string; kind: "story" | "episode" }[];
  const ids = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.target_id);
  const [{ data: posts }, { data: episodes }] = await Promise.all([
    service.from("posts").select("id, title").in("id", ids("story").length ? ids("story") : ["00000000-0000-0000-0000-000000000000"]),
    service.from("episodes").select("id, title").in("id", ids("episode").length ? ids("episode") : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const titles = new Map([...(posts ?? []), ...(episodes ?? [])].map((r) => [r.id as string, (r.title as string | null) ?? null]));
  const items: DigestItem[] = rows.map((r) => ({ kind: r.kind, id: r.target_id, title: titles.get(r.target_id) ?? null }));
  if (items.length === 0) items.push({ kind: "story", id: "test", title: "בדיקה" });

  const digest = buildDigest("בדיקה", items, appUrl, `${appUrl}/settings`);
  const data = buildMessage(
    { name: "סו-בב עולם!", address: user },
    { to: user, ...digest, subject: `[בדיקה] ${digest.subject}` },
    { boundary: `ot-${crypto.randomUUID()}`, date: now, messageId: `${crypto.randomUUID()}@ourtrip` }
  );
  const conn = await gmailConn();
  try {
    const r = await smtpSend(conn, { user, pass }, [{ to: user, data }]);
    return { test: true, sent: r.sent, failed: r.failed.map((f) => f.error) };
  } finally {
    conn.close();
  }
}

async function giveBack(optins: Optin[]): Promise<void> {
  await Promise.all(
    optins.map((o) =>
      service.from("guest_email_optins").update({ last_sent_at: o.last_sent_at }).eq("member_id", o.member_id)
    )
  );
}
