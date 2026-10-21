// Load test: N family members open the app at once and use the wall, likes
// and comments for a while. Each virtual user is its own supabase-js client
// (own login, own realtime socket) doing what the app's screens do after the
// load-test fixes: one trip-filtered wall channel, apply payloads, mark each
// message read once, debounced+spread refetch of likes/comments.
//
// Run against a THROWAWAY project seeded with lt001..ltNNN@loadtest.invalid
// (lt001-002 owners, lt003-004 kids, the rest guests) - never production:
// every wall message fires the push trigger.
//
//   SB_URL=https://<ref>.supabase.co SB_ANON=<anon key> LT_PASSWORD=<pw> \
//     node scripts/loadtest/wall-load.mjs
//
// Knobs (env): USERS=100 RAMP_S=10 DURATION_S=120 MSG_EVERY_S=30
// LIKE_EVERY_S=20 COMMENT_EVERY_S=60. Prints a JSON report; exits 1 when the
// pass criteria fail (any error, p95 > 1000 ms, wall delivery p95 > 2000 ms or
// under 99% delivered).

import { createClient } from "@supabase/supabase-js";

const env = (k, d) => process.env[k] ?? d;
const URL_ = env("SB_URL");
const ANON = env("SB_ANON");
const PASSWORD = env("LT_PASSWORD");
if (!URL_ || !ANON || !PASSWORD) {
  console.error("SB_URL, SB_ANON and LT_PASSWORD are required");
  process.exit(2);
}
if (URL_.includes("xeqfcrxrpfjlqhkijrwd")) {
  console.error("refusing to load-test the production project");
  process.exit(2);
}
const USERS = Number(env("USERS", 100));
const RAMP_S = Number(env("RAMP_S", 10));
const DURATION_S = Number(env("DURATION_S", 120));
const MSG_EVERY_S = Number(env("MSG_EVERY_S", 30));
const LIKE_EVERY_S = Number(env("LIKE_EVERY_S", 20));
const COMMENT_EVERY_S = Number(env("COMMENT_EVERY_S", 60));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spread = (base) => base + Math.floor(Math.random() * base * 4);
// exponential gaps, so actions arrive like people do, not in lockstep
const gap = (meanS) => -Math.log(1 - Math.random()) * meanS * 1000;

// ---------- metrics ----------
const timings = new Map(); // op -> number[]
const errors = new Map(); // "op: message" -> count
const sent = new Map(); // wall message tag -> { at, sender }
const deliveries = []; // ms from send to receipt, per (message, receiver)
const received = new Map(); // tag -> Set(receiver)
const channelTrouble = new Map(); // status -> count
let realtimeEvents = 0;

function record(op, ms) {
  if (!timings.has(op)) timings.set(op, []);
  timings.get(op).push(ms);
}
function fail(op, err) {
  const key = `${op}: ${err?.message ?? err?.code ?? String(err)}`.slice(0, 160);
  errors.set(key, (errors.get(key) ?? 0) + 1);
}
async function timed(op, fn) {
  const t = performance.now();
  try {
    const res = await fn();
    if (res && res.error) throw res.error;
    record(op, performance.now() - t);
    return res;
  } catch (err) {
    fail(op, err);
    return null;
  }
}
function pct(arr, p) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}

// ---------- one virtual user ----------
async function user(i, startAt, endAt) {
  const email = `lt${String(i).padStart(3, "0")}@loadtest.invalid`;
  const sb = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 50 } },
  });
  await sleep(Math.max(0, startAt - Date.now()));

  const login = await timed("auth.signIn", () => sb.auth.signInWithPassword({ email, password: PASSWORD }));
  if (!login) return;
  const me = await timed("members.self", () =>
    sb.from("members").select("id, trip_id, role").eq("auth_user_id", login.data.user.id).single()
  );
  if (!me) return;
  const { id: memberId, trip_id: tripId, role } = me.data;

  // opening the app: trip, names, wall, unread badge, stories feed
  await timed("trips.active", () => sb.from("trips").select("*").eq("is_active", true).limit(1));
  await timed("rpc.trip_member_names", () => sb.rpc("trip_member_names", { p_trip_id: tripId }));
  const wall = await timed("messages.list", () =>
    sb.from("messages").select("*").eq("trip_id", tripId).eq("channel", "guests").order("created_at")
  );
  const marked = new Set();
  const markRead = async (ids) => {
    const fresh = ids.filter((id) => !marked.has(id));
    if (fresh.length === 0) return;
    const ok = await timed("message_reads.upsert", () =>
      sb.from("message_reads").upsert(
        fresh.map((id) => ({ message_id: id, member_id: memberId })),
        { onConflict: "message_id,member_id", ignoreDuplicates: true }
      )
    );
    if (ok) for (const id of fresh) marked.add(id);
  };
  await markRead((wall?.data ?? []).map((m) => m.id));

  const loadFeedback = () =>
    Promise.all([
      timed("reactions.list", () => sb.from("reactions").select("*").eq("trip_id", tripId).order("created_at")),
      timed("comments.list", () => sb.from("comments").select("*").eq("trip_id", tripId).order("created_at")),
    ]);
  const posts = await timed("posts.feed", () =>
    sb.from("posts").select("*").eq("trip_id", tripId).eq("status", "approved").order("published_at", { ascending: false })
  );
  await loadFeedback();
  const postIds = (posts?.data ?? []).map((p) => p.id);

  // realtime, as the screens subscribe after 00058/useUnreadWall changes
  const filter = `trip_id=eq.${tripId}`;
  const onWall = (payload) => {
    realtimeEvents += 1;
    const row = payload.new ?? {};
    if (payload.eventType === "INSERT" && typeof row.body === "string" && row.body.startsWith("lt:")) {
      const info = sent.get(row.body);
      if (info && info.sender !== i) {
        deliveries.push(Date.now() - info.at);
        if (!received.has(row.body)) received.set(row.body, new Set());
        received.get(row.body).add(i);
      }
      if (row.sender_id !== memberId) void markRead([row.id]);
    }
  };
  const watchStatus = (status) => {
    if (status !== "SUBSCRIBED") channelTrouble.set(status, (channelTrouble.get(status) ?? 0) + 1);
  };
  const wallCh = sb
    .channel(`lt-wall-${i}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, onWall)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, onWall)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, onWall)
    .subscribe(watchStatus);

  let fbTimer = null;
  const onFeedback = () => {
    realtimeEvents += 1;
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(() => {
      fbTimer = null;
      void loadFeedback();
    }, spread(300));
  };
  let fbCh = sb.channel(`lt-feedback-${i}`);
  for (const table of ["reactions", "comments"]) {
    fbCh = fbCh
      .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, onFeedback)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, onFeedback)
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, onFeedback);
  }
  fbCh.subscribe(watchStatus);

  // wait for everyone to be in before the clock starts, then act until the end
  await sleep(Math.max(0, startAt + RAMP_S * 1000 - Date.now()));
  let seq = 0;
  const loops = [
    async () => {
      while (Date.now() < endAt) {
        await sleep(gap(MSG_EVERY_S));
        if (Date.now() >= endAt) break;
        const tag = `lt:${i}:${Date.now()}:${seq++}`;
        sent.set(tag, { at: Date.now(), sender: i, kid: role === "kid" });
        await timed("messages.insert", () =>
          sb.from("messages").insert({ trip_id: tripId, sender_id: memberId, body: tag, channel: "guests" })
        );
      }
    },
    async () => {
      while (Date.now() < endAt && role !== "owner" && postIds.length > 0) {
        await sleep(gap(LIKE_EVERY_S));
        if (Date.now() >= endAt) break;
        const post_id = postIds[Math.floor(Math.random() * postIds.length)];
        const kind = ["heart", "smile", "wow", "star"][Math.floor(Math.random() * 4)];
        const t = performance.now();
        const { error } = await sb.from("reactions").insert({ trip_id: tripId, member_id: memberId, post_id, kind });
        // already liked that way: the app treats a duplicate as success
        if (error && error.code !== "23505") fail("reactions.insert", error);
        else record("reactions.insert", performance.now() - t);
      }
    },
    async () => {
      while (Date.now() < endAt && role === "guest" && postIds.length > 0) {
        await sleep(gap(COMMENT_EVERY_S));
        if (Date.now() >= endAt) break;
        const post_id = postIds[Math.floor(Math.random() * postIds.length)];
        await timed("comments.insert", () =>
          sb.from("comments").insert({ trip_id: tripId, author_id: memberId, post_id, body: `תגובת עומס ${seq++}` })
        );
      }
    },
    async () => {
      // navigation: the badge recounts on every page change
      while (Date.now() < endAt && role !== "owner") {
        await sleep(gap(45));
        if (Date.now() >= endAt) break;
        await Promise.all([
          timed("unread.messages", () => sb.from("messages").select("id, sender_id").eq("trip_id", tripId).eq("channel", "guests")),
          timed("unread.reads", () => sb.from("message_reads").select("message_id").eq("member_id", memberId)),
        ]);
      }
    },
  ];
  await Promise.all(loops.map((l) => l()));
  await sleep(5000); // let the last deliveries land
  if (fbTimer) clearTimeout(fbTimer);
  await sb.removeChannel(wallCh);
  await sb.removeChannel(fbCh);
}

// ---------- run ----------
const t0 = Date.now() + 2000;
const endAt = t0 + RAMP_S * 1000 + DURATION_S * 1000;
console.error(`load test: ${USERS} users, ramp ${RAMP_S}s, steady ${DURATION_S}s`);
await Promise.all(
  Array.from({ length: USERS }, (_, k) => user(k + 1, t0 + Math.floor((k / USERS) * RAMP_S * 1000), endAt))
);

// a kid's message waits for a parent, so only the others count as "should reach everyone"
const expected = [...sent.entries()].filter(([, v]) => !v.kid);
const perMessageReach = expected.map(([tag]) => received.get(tag)?.size ?? 0);
const shouldReach = USERS - 1;
const deliveredRatio =
  expected.length === 0 ? 1 : perMessageReach.reduce((a, b) => a + b, 0) / (expected.length * shouldReach);

const ops = Object.fromEntries(
  [...timings.entries()].sort().map(([op, arr]) => [op, { n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: pct(arr, 100) }])
);
const allMs = [...timings.values()].flat();
const report = {
  users: USERS,
  durationS: DURATION_S,
  requests: allMs.length,
  errors: Object.fromEntries(errors),
  errorCount: [...errors.values()].reduce((a, b) => a + b, 0),
  overall: { p50: pct(allMs, 50), p95: pct(allMs, 95), p99: pct(allMs, 99) },
  ops,
  realtime: {
    wallMessagesSent: sent.size,
    events: realtimeEvents,
    deliveredRatio: Math.round(deliveredRatio * 10000) / 100,
    deliveryMs: { p50: pct(deliveries, 50), p95: pct(deliveries, 95), p99: pct(deliveries, 99), max: pct(deliveries, 100) },
    channelTrouble: Object.fromEntries(channelTrouble),
  },
};
const pass =
  report.errorCount === 0 &&
  (report.overall.p95 ?? 0) <= 1000 &&
  (report.realtime.deliveryMs.p95 ?? 0) <= 2000 &&
  report.realtime.deliveredRatio >= 99;
report.pass = pass;
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
