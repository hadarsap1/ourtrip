// Sprint 8 - Web Push fan-out (SPEC 2.14). Single entry point for all four
// notification kinds; the DB decides who exists, this function only decides
// who to notify:
//   - wall-message  : new family-wall message → everyone on the trip but the sender
//   - pending-photo : kid/owner upload awaiting approval → owners
//   - daily (cron)  : rain-on-outdoor-day alert + flight check-in 24h reminder
//   - backup-stale  : the weekly backup has not landed → owners (migration
//                     00026; see the incident note in backup-weekly)
//   - hourly (cron, 1.11): in the family's LOCAL time - 09:00 cancellation +
//                     visa deadlines, 19:00 tomorrow digest, 20:00 evening
//                     journal. Quiet hours 22:00-07:00. Policy lives in
//                     _shared/notifyPolicy.ts (tested).
//   - leave-now (cron every 15 min, 1.11): the next placed item's leave-by
//                     time falls in the coming 15 minutes → owners.
//   Kill switch for both: set NOTIFY_V2=off on the function.
//
// Invoked by pg_net (message/photo AFTER-INSERT triggers) and pg_cron (daily),
// so it is deployed verify_jwt=false. A forged call leaks no content - the
// ids are unguessable UUIDs and everything is loaded server-side - but the
// review pointed out it can still spam the family with real notifications at
// any hour. Since migration 00025 both callers send a shared secret and
// cronAuthorized() checks it.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  addDays,
  cancelDeadline,
  isReminderDay,
  leaveNowDue,
  localNow,
  slotsDue,
  visaRemindersDue,
  zoneFor,
  type LocalNow,
} from "../_shared/notifyPolicy.ts";
import { leaveByMinutes, minutesOfTime, originFor, placeOf, travelMinutes } from "../_shared/travel.ts";

// ---- shared-secret gate (review findings M3/M4) ----
// This function runs verify_jwt=false because pg_cron carries no JWT, which
// left it invokable by anyone who knows the URL. Both callers now send
// x-cron-secret (migration 00025) and we check it here.
//
// Deliberately fails OPEN while CRON_SECRET is unset: shipping the check
// before the secret exists would stop notifications with nothing surfacing the
// failure, which is the silent breakage supabase/config.toml exists to
// prevent. Setting CRON_SECRET (both sides - see 00025) switches it on.
function cronAuthorized(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return true;
  const got = req.headers.get("x-cron-secret") ?? "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type Payload = { title: string; body: string; url: string; tag?: string };

/** Sends one payload to every push subscription owned by the given members.
 *  Prunes subscriptions the push service reports as gone (404/410). */
async function pushToMembers(memberIds: string[], payload: Payload): Promise<number> {
  if (memberIds.length === 0) return 0;
  const { data: subs } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("member_id", memberIds);
  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await service.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return sent;
}

async function ownerIds(tripId: string): Promise<string[]> {
  const { data } = await service
    .from("members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("role", "owner");
  return (data ?? []).map((m) => m.id);
}

async function familyIds(tripId: string): Promise<string[]> {
  // owners + kids (not guests) - guests get the wall via the portal, not push
  const { data } = await service
    .from("members")
    .select("id")
    .eq("trip_id", tripId)
    .in("role", ["owner", "kid"]);
  return (data ?? []).map((m) => m.id);
}

async function handleWallMessage(messageId: string): Promise<number> {
  const { data: msg } = await service
    .from("messages")
    .select("id, body, sender_id, trip_id, channel")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return 0;

  const { data: members } = await service
    .from("members")
    .select("id, display_name, role")
    .eq("trip_id", msg.trip_id);
  const sender = members?.find((m) => m.id === msg.sender_id);

  // Notify only the roles that can actually READ this feed (migration 00027).
  // Without this the split would leak by notification: a guest would get a
  // push preview of a message the policies forbid them to open.
  const audience = msg.channel === "guests"
    ? ["owner", "guest"]
    : ["owner", "kid"];
  const recipients = (members ?? [])
    .filter((m) => audience.includes(m.role) && m.id !== msg.sender_id)
    .map((m) => m.id);

  const preview = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
  return pushToMembers(recipients, {
    title:
      msg.channel === "guests"
        ? "הודעה חדשה בקיר האורחים 💬"
        : "הודעה חדשה בקיר המשפחתי 💬",
    body: sender ? `${sender.display_name}: ${preview}` : preview,
    url: "/messages",
    tag: "wall",
  });
}

async function handlePendingPhoto(photoId: string): Promise<number> {
  const { data: photo } = await service
    .from("photos")
    .select("id, trip_id, status, uploaded_by")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo || photo.status !== "pending") return 0;
  // don't ping the uploader about approving their own upload
  const owners = (await ownerIds(photo.trip_id)).filter(
    (id) => id !== photo.uploaded_by
  );
  return pushToMembers(owners, {
    title: "תמונה חדשה ממתינה לאישור 📷",
    body: "יש תמונה חדשה מהילדים - אפשר לאשר ולשתף",
    url: "/photos",
    tag: "pending-photo",
  });
}

/** The weekly backup has gone stale. Sent by check_backup_freshness (00026),
 *  which exists because a failing backup is otherwise completely silent -
 *  cron reports success for a merely-queued request. Owners only. */
async function handleBackupStale(ageDays: number): Promise<number> {
  const { data: trip } = await service
    .from("trips")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!trip) return 0;

  return pushToMembers(await ownerIds(trip.id), {
    title: "⚠️ הגיבוי השבועי לא רץ",
    body:
      ageDays < 0
        ? "לא נמצא אף גיבוי במערכת - כדאי לבדוק מה קרה"
        : `הגיבוי האחרון בן ${ageDays} ימים - כדאי לבדוק מה קרה`,
    url: "/more",
    tag: "backup-stale",
  });
}

async function handleDaily(): Promise<{ weather: number; checkin: number }> {
  const { data: trip } = await service
    .from("trips")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!trip) return { weather: 0, checkin: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  // ---- rain-on-outdoor-day alert (today) ----
  let weatherSent = 0;
  const { data: day } = await service
    .from("itinerary_days")
    .select("id, location_name, lat, lng")
    .eq("trip_id", trip.id)
    .eq("date", today)
    .maybeSingle();
  if (day?.lat != null && day.lng != null) {
    const { data: outdoor } = await service
      .from("itinerary_items")
      .select("id")
      .eq("day_id", day.id)
      .eq("is_outdoor", true)
      .neq("status", "cancelled")
      .limit(1);
    if (outdoor && outdoor.length > 0) {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${day.lat}&longitude=${day.lng}` +
          `&daily=precipitation_probability_max&timezone=auto&start_date=${today}&end_date=${today}`;
        const res = await fetch(url);
        const chance = res.ok
          ? (await res.json())?.daily?.precipitation_probability_max?.[0] ?? 0
          : 0;
        if (chance > 50) {
          weatherSent = await pushToMembers(await familyIds(trip.id), {
            title: "☔ יתכן גשם היום",
            body: `סיכוי משקעים ${chance}% ${
              day.location_name ? `ב${day.location_name}` : ""
            } - יש פעילות בחוץ במסלול`,
            url: "/",
            tag: "weather",
          });
        }
      } catch {
        // weather provider down - skip the alert, never fail the digest
      }
    }
  }

  // ---- flight check-in reminder (flight departing tomorrow) ----
  const { data: flights } = await service
    .from("bookings")
    .select("id, title, start_date")
    .eq("trip_id", trip.id)
    .eq("type", "flight")
    .eq("start_date", tomorrow)
    .neq("status", "cancelled");
  let checkinSent = 0;
  if (flights && flights.length > 0) {
    const owners = await ownerIds(trip.id);
    for (const f of flights) {
      checkinSent += await pushToMembers(owners, {
        title: "🛫 צ'ק-אין לטיסה מחר",
        body: `${f.title} - מומלץ לבצע צ'ק-אין מקוון`,
        url: "/itinerary",
        tag: `checkin-${f.id}`,
      });
    }
  }

  return { weather: weatherSent, checkin: checkinSent };
}


// ---------------------------------------------------------------------------
// 1.11 - local-time notifications
// ---------------------------------------------------------------------------

async function activeTripId(): Promise<string | null> {
  const { data } = await service.from("trips").select("id").eq("is_active", true).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** The family's local clock: the zone of the latest itinerary country up to today (UTC), else Israel. */
async function familyLocalNow(tripId: string): Promise<LocalNow> {
  const now = new Date();
  const { data } = await service
    .from("itinerary_days")
    .select("country_code")
    .eq("trip_id", tripId)
    .lte("date", addDays(now.toISOString().slice(0, 10), 1))
    .not("country_code", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return localNow(now, zoneFor(data?.country_code));
}

const hm = (time: string) => time.slice(0, 5);

async function sendDeadlines(tripId: string, today: string): Promise<number> {
  const owners = await ownerIds(tripId);
  let sent = 0;

  const { data: bookings } = await service
    .from("bookings")
    .select("id, title, details")
    .eq("trip_id", tripId)
    .neq("status", "cancelled");
  for (const b of bookings ?? []) {
    const until = cancelDeadline(b.details);
    if (!until || !isReminderDay(today, until)) continue;
    const [y, m, d] = until.split("-");
    sent += await pushToMembers(owners, {
      title: "⏳ ביטול חינם עומד להסתיים",
      body: `${b.title} - אפשר לבטל בלי עלות עד ${d}/${m}/${y}`,
      url: "/itinerary",
      tag: `cancel-${b.id}`,
    });
  }

  const [{ data: visas }, { data: days }] = await Promise.all([
    service.from("visa_requirements").select("country_code, requirement_type, status, max_days, title_he").eq("trip_id", tripId),
    service.from("itinerary_days").select("date, country_code").eq("trip_id", tripId),
  ]);
  for (const r of visaRemindersDue(today, visas ?? [], days ?? [])) {
    const [y, m, d] = r.date.split("-");
    sent += await pushToMembers(owners, {
      title: r.kind === "apply" ? "🛂 ויזה / טופס כניסה עדיין פתוח" : "🛂 תקופת השהייה מתקרבת לסוף",
      body:
        r.kind === "apply"
          ? `${r.title} - נכנסים ב-${d}/${m}/${y}`
          : `${r.title} - היום האחרון המותר ${d}/${m}/${y}`,
      url: "/visas",
      tag: `visa-${r.kind}-${r.country}`,
    });
  }
  return sent;
}

async function sendTomorrowDigest(tripId: string, today: string): Promise<number> {
  const tomorrow = addDays(today, 1);
  const { data: day } = await service
    .from("itinerary_days")
    .select("id, location_name")
    .eq("trip_id", tripId)
    .eq("date", tomorrow)
    .maybeSingle();
  if (!day) return 0; // before the trip, or a day not planned yet
  const [{ data: items }, { data: bookings }] = await Promise.all([
    service.from("itinerary_items").select("title, start_time").eq("day_id", day.id).neq("status", "cancelled").order("start_time"),
    service.from("bookings").select("title, type").eq("trip_id", tripId).eq("start_date", tomorrow).neq("status", "cancelled"),
  ]);
  const list = items ?? [];
  const first = list.find((i) => i.start_time);
  const parts = [
    list.length > 0 ? `${list.length} פעילויות` : "יום פנוי",
    first ? `הראשונה ב-${hm(first.start_time as string)} (${first.title})` : null,
    ...(bookings ?? []).map((b) => (b.type === "flight" ? `טיסה: ${b.title}` : b.type === "hotel" ? `צ'ק-אין: ${b.title}` : b.title)),
  ].filter(Boolean);
  return pushToMembers(await ownerIds(tripId), {
    title: `🗓️ מחר${day.location_name ? ` ב${day.location_name}` : ""}`,
    body: parts.join(" · "),
    url: "/itinerary",
    tag: `digest-${tomorrow}`,
  });
}

async function sendEveningJournal(tripId: string, today: string): Promise<number> {
  const { data: day } = await service.from("itinerary_days").select("id").eq("trip_id", tripId).eq("date", today).maybeSingle();
  if (!day) return 0; // only while travelling
  const family = await familyIds(tripId);
  const { data: wrote } = await service.from("journal_entries").select("author_id").eq("trip_id", tripId).eq("entry_date", today);
  const done = new Set((wrote ?? []).map((w) => w.author_id));
  return pushToMembers(
    family.filter((id) => !done.has(id)),
    { title: "✍️ איך היה היום?", body: "שתי שורות ביומן, לפני שהיום מתערבב עם מחר", url: "/journal", tag: `journal-${today}` }
  );
}

async function handleHourly(): Promise<Record<string, number | string>> {
  const tripId = await activeTripId();
  if (!tripId) return { skipped: "no trip" };
  const local = await familyLocalNow(tripId);
  const out: Record<string, number | string> = { local: `${local.date} ${Math.floor(local.minutes / 60)}h` };
  for (const slot of slotsDue(local.minutes)) {
    if (slot === "deadlines") out.deadlines = await sendDeadlines(tripId, local.date);
    if (slot === "tomorrowDigest") out.digest = await sendTomorrowDigest(tripId, local.date);
    if (slot === "eveningJournal") out.journal = await sendEveningJournal(tripId, local.date);
  }
  return out;
}

async function handleLeaveNow(): Promise<number> {
  const tripId = await activeTripId();
  if (!tripId) return 0;
  const local = await familyLocalNow(tripId);
  const { data: day } = await service
    .from("itinerary_days")
    .select("id, lat, lng")
    .eq("trip_id", tripId)
    .eq("date", local.date)
    .maybeSingle();
  if (!day) return 0;
  const { data: items } = await service
    .from("itinerary_items")
    .select("id, title, start_time, lat, lng, status")
    .eq("day_id", day.id)
    .neq("status", "cancelled");
  const list = items ?? [];
  let sent = 0;
  for (const it of list) {
    const start = minutesOfTime(it.start_time);
    const to = placeOf(it);
    if (start === null || !to || it.status === "done") continue;
    const from = originFor(list, it, placeOf(day));
    const leaveBy = leaveByMinutes(start, from, to);
    if (!leaveNowDue(leaveBy, local.minutes)) continue;
    sent += await pushToMembers(await ownerIds(tripId), {
      title: "🚶 הגיע הזמן לצאת",
      body: `${it.title} ב-${hm(it.start_time as string)} - כ-${from ? travelMinutes(from, to) : 0} דקות דרך (הערכה)`,
      url: "/",
      tag: `leave-${it.id}`,
    });
  }
  return sent;
}

Deno.serve(async (req) => {
  if (!cronAuthorized(req)) return json({ ok: false, error: "forbidden" }, 401);

  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) {
    return json({ ok: false, error: "VAPID keys not configured" }, 500);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let body: {
    type?: string;
    message_id?: string;
    photo_id?: string;
    age_days?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad request" }, 400);
  }

  try {
    switch (body.type) {
      case "wall-message": {
        if (!body.message_id) return json({ ok: false, error: "missing message_id" }, 400);
        return json({ ok: true, sent: await handleWallMessage(body.message_id) });
      }
      case "pending-photo": {
        if (!body.photo_id) return json({ ok: false, error: "missing photo_id" }, 400);
        return json({ ok: true, sent: await handlePendingPhoto(body.photo_id) });
      }
      case "daily": {
        return json({ ok: true, ...(await handleDaily()) });
      }
      case "hourly":
      case "leave-now": {
        if (Deno.env.get("NOTIFY_V2") === "off") return json({ ok: true, skipped: "NOTIFY_V2=off" });
        return body.type === "hourly"
          ? json({ ok: true, ...(await handleHourly()) })
          : json({ ok: true, sent: await handleLeaveNow() });
      }
      case "backup-stale": {
        const age = typeof body.age_days === "number" ? body.age_days : -1;
        return json({ ok: true, sent: await handleBackupStale(age) });
      }
      default:
        return json({ ok: false, error: "unknown type" }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
