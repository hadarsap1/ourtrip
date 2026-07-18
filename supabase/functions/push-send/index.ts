// Sprint 8 — Web Push fan-out (SPEC 2.14). Single entry point for all four
// notification kinds; the DB decides who exists, this function only decides
// who to notify:
//   - wall-message  : new family-wall message → everyone on the trip but the sender
//   - pending-photo : kid/owner upload awaiting approval → owners
//   - daily (cron)  : rain-on-outdoor-day alert + flight check-in 24h reminder
//
// Invoked by pg_net (message/photo AFTER-INSERT triggers) and pg_cron (daily),
// so it is deployed verify_jwt=false. It never returns data and loads every
// piece of content server-side from the id it is handed, so a forged call can
// at most re-notify legitimate content (accepted risk — docs/SECURITY-CHECKS.md).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  // owners + kids (not guests) — guests get the wall via the portal, not push
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
    .select("id, body, sender_id, trip_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return 0;

  const { data: members } = await service
    .from("members")
    .select("id, display_name")
    .eq("trip_id", msg.trip_id);
  const sender = members?.find((m) => m.id === msg.sender_id);
  const recipients = (members ?? [])
    .map((m) => m.id)
    .filter((id) => id !== msg.sender_id);

  const preview = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
  return pushToMembers(recipients, {
    title: "הודעה חדשה בקיר המשפחתי 💬",
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
    body: "יש תמונה חדשה מהילדים — אפשר לאשר ולשתף",
    url: "/photos",
    tag: "pending-photo",
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
            } — יש פעילות בחוץ במסלול`,
            url: "/",
            tag: "weather",
          });
        }
      } catch {
        // weather provider down — skip the alert, never fail the digest
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
        body: `${f.title} — מומלץ לבצע צ'ק-אין מקוון`,
        url: "/itinerary",
        tag: `checkin-${f.id}`,
      });
    }
  }

  return { weather: weatherSent, checkin: checkinSent };
}

Deno.serve(async (req) => {
  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) {
    return json({ ok: false, error: "VAPID keys not configured" }, 500);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let body: { type?: string; message_id?: string; photo_id?: string };
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
      default:
        return json({ ok: false, error: "unknown type" }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
