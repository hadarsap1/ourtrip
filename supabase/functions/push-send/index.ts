// Sprint 8 - Web Push fan-out (SPEC 2.14). Single entry point for all four
// notification kinds; the DB decides who exists, this function only decides
// who to notify:
//   - wall-message  : new wall message → everyone who may read it (its group
//                     audience, 00063) but the sender
//   - pending-photo : kid/owner upload awaiting approval → owners
//   - guest-request : someone asked to join through the join link (00054) → owners
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
//   - friend-connected (00110): a friend's tablet used its code → owners.
//   - guest-updates (00100): a new update or podcast episode → the guests
//                     who may see it and turned push on. Called by the
//                     publish triggers and a 15-minute sweep; each item is
//                     claimed once in guest_update_pushes. Held 22:00-07:00
//                     Israel time. Kill switch: NOTIFY_GUESTS=off.
//   - feedback (00104): a new comment or like → the parents but its author,
//                     as one quiet, folded notification that also sets the
//                     number on the app icon. Called by the insert triggers
//                     and a 15-minute sweep; each item is claimed once in
//                     feedback_pushes. Held 22:00-07:00 in the family's local
//                     time. Kill switch: NOTIFY_FEEDBACK=off.
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
  inQuietHours,
  isReminderDay,
  leaveNowDue,
  localNow,
  slotsDue,
  visaRemindersDue,
  zoneFor,
  type LocalNow,
} from "../_shared/notifyPolicy.ts";
import { leaveByMinutes, minutesOfTime, originFor, placeOf, travelMinutes } from "../_shared/travel.ts";
import { canReadWallMessage, type WallReader } from "../_shared/wallAudience.ts";
import { guestQuietNow, guestUpdateRecipients } from "../_shared/guestUpdates.ts";
import { feedbackPayloadFor, type FeedbackItem } from "../_shared/feedbackPush.ts";

// Since 00052 the secret is generated and kept in the database (it never
// passes through a file or a dashboard): the jobs send it, and this asks the
// database whether the header matches. A CRON_SECRET function secret, if one
// is ever set, is checked instead. Fails CLOSED: no header, a wrong one, or a
// failed lookup is a 401.
async function cronAuthorized(req: Request): Promise<boolean> {
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!got) return false;
  const expected = Deno.env.get("CRON_SECRET");
  if (expected) {
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) {
      diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.rpc("cron_secret_matches", { p_secret: got });
  return !error && data === true;
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

// `many` folds repeats into one notification on the device (public/sw.js): a
// push whose tag is already showing replaces it, titled with the count
// ("{n}" is filled in there). The app itself still lists every item.
// `count` (default 1) is how many items this one push stands for, `silent`
// never rings, `badge` adds the count to the number on the app icon, and
// `manyUrl` is where a folded notification opens.
type Payload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  many?: string;
  count?: number;
  silent?: boolean;
  badge?: boolean;
  manyUrl?: string;
};

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
  // owners + kids (not guests) - guests get only updates and episodes by push (00100)
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
    .select("id, body, sender_id, trip_id, channel, approved_at, approved_by, audience")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return 0;

  const [{ data: members }, { data: allowed }] = await Promise.all([
    service.from("members").select("id, display_name, role, email").eq("trip_id", msg.trip_id),
    service.from("guests_allowlist").select("email, labels").eq("trip_id", msg.trip_id).is("revoked_at", null),
  ]);
  const sender = members?.find((m) => m.id === msg.sender_id);
  // a revoked guest keeps the members row (and maybe a push subscription), but
  // must not get wall previews any more (security pass 14/10)
  const activeGuests = new Map(
    (allowed ?? []).map((a) => [a.email.toLowerCase(), (a.labels ?? []) as string[]])
  );

  // Notify only those who can actually READ this message, or a push preview
  // would leak what the policies forbid opening: a kid's message waiting for
  // approval (00049) is the parents' alone - once approved this runs again
  // (messages_notify_approved) - and a group message (00063/00064) goes to
  // the family and its groups' guests only. The retired family channel never
  // reached guests.
  const pending = msg.approved_at === null;
  const audience = (msg.audience ?? []) as string[];
  const recipients = (members ?? [])
    .filter((m) => {
      if (m.id === msg.sender_id || m.id === msg.approved_by) return false;
      // a guest turns push on for updates and episodes only (00100,
      // DECISIONS #71); the wall waits for them in the app
      if (m.role === "guest") return false;
      const guestLabels = m.role === "guest" && m.email ? activeGuests.get(m.email.toLowerCase()) : undefined;
      return canReadWallMessage(
        {
          role: m.role as WallReader["role"],
          guestLabels: guestLabels ?? [],
          active: m.role !== "guest" || guestLabels !== undefined,
        },
        { pending, audience }
      );
    })
    .map((m) => m.id);

  const preview = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
  return pushToMembers(recipients, {
    title: pending ? "הודעה ממתינה לאישור שלכם ✋" : "הודעה חדשה בצ'אט 💬",
    body: sender ? `${sender.display_name}: ${preview}` : preview,
    url: "/messages",
    tag: pending ? "wall-pending" : "wall",
    many: pending ? "{n} הודעות ממתינות לאישור שלכם ✋" : "{n} הודעות חדשות בצ'אט 💬",
  });
}

/** New updates and episodes guests may see and were not told about yet → the
 *  guests who may see each one (00100). Everything is read here; the caller
 *  only says "look". */
async function handleGuestUpdates(): Promise<number | string> {
  if (guestQuietNow(new Date())) return "quiet";
  const nowIso = new Date().toISOString();
  const [{ data: posts }, { data: episodes }] = await Promise.all([
    service
      .from("posts")
      .select("id, trip_id, title, audience")
      .eq("status", "approved")
      .in("visibility", ["guests", "public"])
      .or(`publish_after.is.null,publish_after.lte.${nowIso}`),
    service
      .from("episodes")
      .select("id, trip_id, title")
      .eq("status", "approved")
      .eq("shared_with_guests", true),
  ]);
  const items = [
    ...(posts ?? []).map((p) => ({
      kind: "story" as const,
      id: p.id as string,
      tripId: p.trip_id as string,
      title: (p.title as string | null) ?? null,
      audience: (p.audience ?? []) as string[],
    })),
    ...(episodes ?? []).map((e) => ({
      kind: "episode" as const,
      id: e.id as string,
      tripId: e.trip_id as string,
      title: (e.title as string | null) ?? null,
      audience: [] as string[],
    })),
  ];
  if (items.length === 0) return 0;

  // one row per update or episode ever shared: small, and no long id list
  const { data: told } = await service.from("guest_update_pushes").select("target_id");
  const done = new Set((told ?? []).map((t) => t.target_id as string));
  const fresh = items.filter((i) => !done.has(i.id));

  const guestsByTrip = new Map<string, Promise<[GuestMember[], GuestAllow[]]>>();
  const guestsOf = (tripId: string) => {
    let p = guestsByTrip.get(tripId);
    if (!p) {
      p = Promise.all([
        service.from("members").select("id, role, email").eq("trip_id", tripId).eq("role", "guest"),
        service.from("guests_allowlist").select("email, labels").eq("trip_id", tripId).is("revoked_at", null),
      ]).then(([m, a]) => [(m.data ?? []) as GuestMember[], (a.data ?? []) as GuestAllow[]]);
      guestsByTrip.set(tripId, p);
    }
    return p;
  };

  let sent = 0;
  for (const item of fresh) {
    // claim first: a trigger call and the sweep may run together
    const { data: claimed } = await service
      .from("guest_update_pushes")
      .upsert({ target_id: item.id, kind: item.kind, trip_id: item.tripId }, { onConflict: "target_id", ignoreDuplicates: true })
      .select("target_id");
    if (!claimed || claimed.length === 0) continue;

    const [members, allowlist] = await guestsOf(item.tripId);
    const recipients = guestUpdateRecipients(members, allowlist, { kind: item.kind, audience: item.audience });
    sent += await pushToMembers(
      recipients,
      item.kind === "story"
        ? {
            title: "עדכון חדש מהדרך ✍️",
            body: item.title || "כתבנו עדכון חדש - בואו לקרוא",
            url: `/stories#story-${item.id}`,
            tag: "guest-story",
            many: "{n} עדכונים חדשים מהדרך ✍️",
          }
        : {
            title: "פרק חדש בפודקאסט 🎙️",
            body: item.title || "הקלטנו פרק חדש - בואו להקשיב",
            url: `/podcast#episode-${item.id}`,
            tag: "guest-episode",
            many: "{n} פרקים חדשים בפודקאסט 🎙️",
          }
    );
  }
  return sent;
}

/** New comments and likes of the last day not yet told → the parents but
 *  each one's author (00104). Owners read every comment and like, so nothing
 *  here shows them what they could not open. Held in the family's quiet hours;
 *  the 15-minute sweep sends it at 07:00. */
async function handleFeedback(): Promise<number | string> {
  const tripId = await activeTripId();
  if (!tripId) return 0;
  if (inQuietHours((await familyLocalNow(tripId)).minutes)) return "quiet";

  const since = new Date(Date.now() - 864e5).toISOString();
  const [{ data: comments }, { data: reactions }, { data: told }] = await Promise.all([
    service
      .from("comments")
      .select("id, author_id, body, created_at, post_id, episode_id, photo_id")
      .eq("trip_id", tripId)
      .gte("created_at", since),
    service
      .from("reactions")
      .select("id, member_id, kind, created_at, post_id, episode_id, photo_id, comment_id, message_id")
      .eq("trip_id", tripId)
      .gte("created_at", since),
    // a row for anything created since `since` was written after it
    service.from("feedback_pushes").select("target_id").eq("trip_id", tripId).gte("sent_at", since),
  ]);
  const done = new Set((told ?? []).map((t) => t.target_id as string));
  const items: FeedbackItem[] = [
    ...(comments ?? []).map((c) => ({
      id: c.id as string,
      kind: "comment" as const,
      authorId: c.author_id as string,
      createdAt: c.created_at as string,
      body: c.body as string,
      postId: c.post_id as string | null,
      episodeId: c.episode_id as string | null,
      photoId: c.photo_id as string | null,
    })),
    ...(reactions ?? []).map((r) => ({
      id: r.id as string,
      kind: "reaction" as const,
      authorId: r.member_id as string,
      createdAt: r.created_at as string,
      reaction: r.kind as string,
      postId: r.post_id as string | null,
      episodeId: r.episode_id as string | null,
      photoId: r.photo_id as string | null,
      commentId: r.comment_id as string | null,
      messageId: r.message_id as string | null,
    })),
  ];
  const fresh = items.filter((i) => !done.has(i.id));
  if (fresh.length === 0) return 0;

  // claim first: a trigger call and the sweep may run together; only what
  // this call inserted is this call's to send
  const { data: claimed } = await service
    .from("feedback_pushes")
    .upsert(
      fresh.map((i) => ({ target_id: i.id, kind: i.kind, trip_id: tripId })),
      { onConflict: "target_id", ignoreDuplicates: true }
    )
    .select("target_id");
  const mine = new Set((claimed ?? []).map((c) => c.target_id as string));
  const toSend = fresh.filter((i) => mine.has(i.id));
  if (toSend.length === 0) return 0;

  const { data: members } = await service.from("members").select("id, display_name, role").eq("trip_id", tripId);
  const names = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]));
  const owners = (members ?? []).filter((m) => m.role === "owner").map((m) => m.id as string);
  // a like on a comment opens what that comment is on
  const commentTargets = new Map(items.filter((i) => i.kind === "comment").map((i) => [i.id, i]));
  const missing = toSend
    .map((i) => i.commentId)
    .filter((id): id is string => !!id && !commentTargets.has(id));
  if (missing.length > 0) {
    const { data: parents } = await service
      .from("comments")
      .select("id, author_id, created_at, post_id, episode_id, photo_id")
      .in("id", missing);
    for (const c of parents ?? []) {
      commentTargets.set(c.id as string, {
        id: c.id as string,
        kind: "comment",
        authorId: c.author_id as string,
        createdAt: c.created_at as string,
        postId: c.post_id as string | null,
        episodeId: c.episode_id as string | null,
        photoId: c.photo_id as string | null,
      });
    }
  }

  let sent = 0;
  for (const owner of owners) {
    const payload = feedbackPayloadFor(owner, toSend, names, commentTargets);
    if (payload) sent += await pushToMembers([owner], payload);
  }
  return sent;
}

type GuestMember = { id: string; role: string; email: string | null };
type GuestAllow = { email: string; labels: string[] | null };

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
    many: "{n} תמונות ממתינות לאישור 📷",
  });
}

/** Someone asked to join through the guests' join link (00054). The name is
 *  what they typed; the address stays on the guests screen. Owners only. */
async function handleGuestRequest(requestId: string): Promise<number> {
  const { data: request } = await service
    .from("guest_join_requests")
    .select("id, trip_id, display_name, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "pending") return 0;
  return pushToMembers(await ownerIds(request.trip_id), {
    title: "בקשת הצטרפות חדשה 👋",
    body: `${request.display_name} רוצה לעקוב אחרי הטיול - אפשר לאשר`,
    url: "/guests",
    tag: "guest-request",
    many: "{n} בקשות הצטרפות חדשות 👋",
  });
}

/** A friend's tablet used its code (00110). Owners only. */
async function handleFriendConnected(linkId: string): Promise<number> {
  const { data: link } = await service
    .from("friend_links")
    .select("trip_id, friend_name, used_at, revoked_at")
    .eq("id", linkId)
    .maybeSingle();
  if (!link || !link.used_at || link.revoked_at) return 0;
  return pushToMembers(await ownerIds(link.trip_id), {
    title: "טאבלט של חבר/ה התחבר 🤝",
    body: `${link.friend_name} - לא מכירים? אפשר לנתק במסך החברים`,
    url: "/friends",
    tag: "friend-connected",
    many: "{n} טאבלטים של חברים התחברו 🤝",
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
  const { data: wrote } = await service.from("posts").select("author_id").eq("trip_id", tripId).eq("entry_date", today);
  const done = new Set((wrote ?? []).map((w) => w.author_id));
  return pushToMembers(
    family.filter((id) => !done.has(id)),
    { title: "✍️ איך היה היום?", body: "שתי שורות עדכון, לפני שהיום מתערבב עם מחר", url: "/stories", tag: `journal-${today}` }
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
  if (!(await cronAuthorized(req))) return json({ ok: false, error: "forbidden" }, 401);

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
    request_id?: string;
    link_id?: string;
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
      case "guest-request": {
        if (!body.request_id) return json({ ok: false, error: "missing request_id" }, 400);
        return json({ ok: true, sent: await handleGuestRequest(body.request_id) });
      }
      case "friend-connected": {
        if (!body.link_id) return json({ ok: false, error: "missing link_id" }, 400);
        return json({ ok: true, sent: await handleFriendConnected(body.link_id) });
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
      case "guest-updates": {
        if (Deno.env.get("NOTIFY_GUESTS") === "off") return json({ ok: true, skipped: "NOTIFY_GUESTS=off" });
        return json({ ok: true, sent: await handleGuestUpdates() });
      }
      case "feedback": {
        if (Deno.env.get("NOTIFY_FEEDBACK") === "off") return json({ ok: true, skipped: "NOTIFY_FEEDBACK=off" });
        return json({ ok: true, sent: await handleFeedback() });
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
