// "מוכנות ליציאה" — the one screen that answers "what is missing before we fly".
//
// WHY THIS EXISTS. Measured on the live project 2026-09-05, 59 days before
// departure: 227 itinerary days and ZERO itinerary items, zero bookings, zero
// documents, two test expenses. Every screen in the app works; almost every
// table is empty. The risk between now and 03.11.2026 is not a missing feature,
// it is flying with an empty app — and nothing in the app says so, because each
// screen only shows its own emptiness and none of them add up.
//
// The checks below are deliberately things the database can answer. No advice,
// no guessing at visa rules: a count, a status and a link to the screen that
// fixes it.

import { getSupabase } from "@/lib/supabase";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

export type ReadyStatus = "ok" | "warn" | "missing";

export type ReadyCheck = {
  /** Looks up the Hebrew label and detail in strings.ready.checks. */
  key: string;
  status: ReadyStatus;
  /** Substituted into the detail string. */
  values?: Record<string, number | string>;
  href?: string;
};

export type ReadyGroup = { key: string; checks: ReadyCheck[] };

export type ReadinessInput = {
  /** ISO date, injected rather than read from the clock so this is testable. */
  today: string;
  tripStart: string | null;
  tripEnd: string | null;
  documents: { tag: string; expires_at: string | null }[];
  daysTotal: number;
  daysWithItems: number;
  /** The opening stretch, where a gap costs the most. */
  firstDays: { date: string; hasItems: boolean }[];
  bookings: number;
  countries: {
    code: string;
    days: number;
    optionsInBank: number;
    hasEmergency: boolean;
    hasPhrasebook: boolean;
  }[];
  kidDevices: number;
  guests: number;
  pushSubscriptions: number;
};

/** Documents you cannot board without. `vaccine` is deliberately not here: it
 *  is country-dependent and the app has no basis to insist. */
const REQUIRED_DOC_TAGS = ["passport", "insurance"] as const;

export function daysUntil(from: string, to: string | null): number | null {
  if (!to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Turns the raw counts into the rows the screen draws. Pure, so the rules
 *  about what counts as ready are covered by unit tests rather than by looking
 *  at the screen and hoping. */
export function buildReadiness(input: ReadinessInput): ReadyGroup[] {
  const {
    today,
    tripEnd,
    documents,
    daysTotal,
    daysWithItems,
    firstDays,
    bookings,
    countries,
    kidDevices,
    guests,
    pushSubscriptions,
  } = input;

  // ---- documents ----
  const docChecks: ReadyCheck[] = [];
  for (const tag of REQUIRED_DOC_TAGS) {
    const n = documents.filter((d) => d.tag === tag).length;
    docChecks.push({
      key: `doc_${tag}`,
      status: n === 0 ? "missing" : "ok",
      values: { n },
      href: "/documents",
    });
  }
  // A passport that expires mid-trip is worse than one that is missing, because
  // it looks handled.
  const expiring = documents.filter(
    (d) => d.expires_at != null && tripEnd != null && d.expires_at < tripEnd
  ).length;
  if (documents.length > 0) {
    docChecks.push({
      key: "doc_expiring",
      status: expiring > 0 ? "warn" : "ok",
      values: { n: expiring },
      href: "/documents",
    });
  }

  // ---- the opening stretch ----
  const emptyFirstDays = firstDays.filter((d) => !d.hasItems).length;
  const startChecks: ReadyCheck[] = [
    {
      key: "first_days_planned",
      status:
        emptyFirstDays === 0
          ? "ok"
          : emptyFirstDays === firstDays.length
            ? "missing"
            : "warn",
      values: { empty: emptyFirstDays, total: firstDays.length },
      href: "/itinerary",
    },
    {
      key: "bookings",
      status: bookings === 0 ? "missing" : "ok",
      values: { n: bookings },
      href: "/itinerary",
    },
  ];

  // ---- the whole trip ----
  const emptyDays = daysTotal - daysWithItems;
  const noBank = countries.filter((c) => c.optionsInBank === 0);
  const noEmergency = countries.filter((c) => !c.hasEmergency);
  const noPhrasebook = countries.filter((c) => !c.hasPhrasebook);
  const tripChecks: ReadyCheck[] = [
    {
      key: "days_planned",
      status: emptyDays === 0 ? "ok" : emptyDays === daysTotal ? "missing" : "warn",
      values: { empty: emptyDays, total: daysTotal },
      href: "/itinerary",
    },
    {
      key: "bank_coverage",
      status: noBank.length === 0 ? "ok" : "warn",
      values: {
        countries: noBank.map((c) => c.code).join(", "),
        days: noBank.reduce((sum, c) => sum + c.days, 0),
      },
      href: "/options",
    },
    {
      key: "emergency",
      status: noEmergency.length === 0 ? "ok" : "missing",
      values: { countries: noEmergency.map((c) => c.code).join(", ") },
      href: "/emergency",
    },
    {
      key: "phrasebook",
      status: noPhrasebook.length === 0 ? "ok" : "warn",
      values: { countries: noPhrasebook.map((c) => c.code).join(", ") },
      href: "/phrasebook",
    },
  ];

  // ---- people and devices ----
  const peopleChecks: ReadyCheck[] = [
    {
      key: "kid_devices",
      status: kidDevices === 0 ? "warn" : "ok",
      values: { n: kidDevices },
      href: "/kids",
    },
    {
      key: "guests",
      status: guests === 0 ? "warn" : "ok",
      values: { n: guests },
      href: "/guests",
    },
    {
      key: "push",
      status: pushSubscriptions === 0 ? "warn" : "ok",
      values: { n: pushSubscriptions },
      href: "/notifications",
    },
  ];

  return [
    { key: "documents", checks: docChecks },
    { key: "start", checks: startChecks },
    { key: "trip", checks: tripChecks },
    { key: "people", checks: peopleChecks },
  ].filter((g) => g.checks.length > 0 && today !== "");
}

/** Counts every check that is not ok, so the header can lead with one number. */
export function countOutstanding(groups: ReadyGroup[]): number {
  return groups.reduce(
    (sum, g) => sum + g.checks.filter((c) => c.status !== "ok").length,
    0
  );
}

const HOW_MANY_FIRST_DAYS = 14;

/** One round trip per table. The screen is owner-only and opened rarely, so
 *  clarity beats collapsing this into an RPC. */
export async function loadReadiness(
  tripId: string,
  tripStart: string | null,
  tripEnd: string | null,
  today: string
): Promise<ReadinessInput> {
  const client = requireClient();

  const [docs, days, bookings, emergency, phrasebook, devices, guestRows, subs] =
    await Promise.all([
      client.from("documents").select("tag, expires_at").eq("trip_id", tripId),
      client
        .from("itinerary_days")
        .select("id, date, country_code")
        .eq("trip_id", tripId)
        .order("date"),
      client
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId),
      client.from("emergency_info").select("country_code").eq("trip_id", tripId),
      client
        .from("phrasebook_entries")
        .select("country_code")
        .eq("trip_id", tripId),
      client.from("kid_devices").select("id").is("revoked_at", null),
      client
        .from("guests_allowlist")
        .select("email")
        .eq("trip_id", tripId)
        .is("revoked_at", null),
      client.from("push_subscriptions").select("id"),
    ]);

  const dayRows = days.data ?? [];
  const dayIds = dayRows.map((d) => d.id);

  // Which days actually carry something. One query, then a set.
  const items =
    dayIds.length === 0
      ? { data: [] as { day_id: string }[] }
      : await client.from("itinerary_items").select("day_id").in("day_id", dayIds);
  const daysWithItemsSet = new Set((items.data ?? []).map((i) => i.day_id));

  const options = await client
    .from("place_options")
    .select("country_code")
    .eq("trip_id", tripId)
    .neq("status", "rejected");

  const optionsByCountry = new Map<string, number>();
  for (const o of options.data ?? []) {
    if (!o.country_code) continue;
    optionsByCountry.set(
      o.country_code,
      (optionsByCountry.get(o.country_code) ?? 0) + 1
    );
  }

  const emergencySet = new Set(
    (emergency.data ?? []).map((e) => e.country_code)
  );
  const phrasebookSet = new Set(
    (phrasebook.data ?? []).map((p) => p.country_code).filter(Boolean) as string[]
  );

  const daysByCountry = new Map<string, number>();
  for (const d of dayRows) {
    if (!d.country_code) continue;
    daysByCountry.set(d.country_code, (daysByCountry.get(d.country_code) ?? 0) + 1);
  }

  return {
    today,
    tripStart,
    tripEnd,
    documents: docs.data ?? [],
    daysTotal: dayRows.length,
    daysWithItems: dayRows.filter((d) => daysWithItemsSet.has(d.id)).length,
    firstDays: dayRows.slice(0, HOW_MANY_FIRST_DAYS).map((d) => ({
      date: d.date,
      hasItems: daysWithItemsSet.has(d.id),
    })),
    bookings: bookings.count ?? 0,
    countries: [...daysByCountry.entries()].map(([code, dayCount]) => ({
      code,
      days: dayCount,
      optionsInBank: optionsByCountry.get(code) ?? 0,
      hasEmergency: emergencySet.has(code),
      hasPhrasebook: phrasebookSet.has(code),
    })),
    kidDevices: (devices.data ?? []).length,
    guests: (guestRows.data ?? []).length,
    pushSubscriptions: (subs.data ?? []).length,
  };
}

/**
 * The few things worth putting on the home screen.
 *
 * /ready lists everything; the home screen has to pick. Missing beats warning,
 * and within a status the order buildReadiness already returns is the priority
 * order — documents, then the opening days, then the whole trip, then people
 * and devices. A passport you do not have outranks a guest you have not
 * invited, and this keeps that true without a second ranking to maintain.
 */
export function urgentChecks(groups: ReadyGroup[], limit: number): ReadyCheck[] {
  const flat = groups.flatMap((g) => g.checks);
  return [
    ...flat.filter((c) => c.status === "missing"),
    ...flat.filter((c) => c.status === "warn"),
  ].slice(0, limit);
}
