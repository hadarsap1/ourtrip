// What the pre-departure home screen shows besides the countdown.
//
// The screen used to carry the countdown, one expense button and four warning
// rows. Measured on the live project the same day: 553 places collected and 0
// placed on a day, a 24-item checklist called "הזמנות ודדליינים" with 0 ticked,
// and ₪155,377 promised against a ₪170,000 budget. All of that already existed
// and none of it was visible from the home screen, which showed only what was
// MISSING - a list of failures with no sense of the trip taking shape.
//
// So this adds the three things that are real: what still has to be booked,
// where the money stands, and the shape of the trip itself.

import { resolveBudgetTotals, type BudgetTotals } from "@/lib/budget";
import { listDestinations, type Destination } from "@/lib/data/facts";
import { getSupabase } from "@/lib/supabase";

function requireClient() {
  const client = getSupabase();
  if (!client) throw new Error("supabase_not_configured");
  return client;
}

/** One stretch of the trip, with how much of it is actually planned. */
export type TimelineStretch = Destination & {
  daysWithItems: number;
  /** Today falls inside this stretch. Before departure nothing is current. */
  isCurrent: boolean;
  /** The next stretch the family reaches. Exactly one is true before the trip. */
  isNext: boolean;
};

export type ChecklistPreview = {
  id: string;
  title: string;
  total: number;
  done: number;
  /** The first few still open, so they can be ticked without leaving home. */
  open: { id: string; label: string }[];
};

export type BudgetSummary = BudgetTotals & { spent: number };

export type HomeSummary = {
  budget: BudgetSummary | null;
  checklist: ChecklistPreview | null;
  timeline: TimelineStretch[];
};

const HOW_MANY_OPEN_ITEMS = 3;

/**
 * Marks which stretch the family is in, or is heading to next.
 *
 * Pure, because "which one is next" is the kind of off-by-one that looks right
 * on the screen the day you write it and is wrong the day the trip starts.
 */
export function buildTimeline(
  destinations: Destination[],
  daysWithItemsByKey: Map<string, number>,
  todayISO: string
): TimelineStretch[] {
  const currentIndex = destinations.findIndex(
    (d) => d.from <= todayISO && todayISO <= d.to
  );
  const nextIndex =
    currentIndex === -1
      ? destinations.findIndex((d) => d.from > todayISO)
      : -1;

  return destinations.map((d, i) => ({
    ...d,
    daysWithItems: daysWithItemsByKey.get(`${d.countryCode}::${d.locationName}`) ?? 0,
    isCurrent: i === currentIndex,
    isNext: i === nextIndex,
  }));
}

/** The checklist worth showing, and the first few things still open on it. */
export function buildChecklistPreview(
  checklist: { id: string; title: string } | null,
  items: { id: string; label: string; checked: boolean }[]
): ChecklistPreview | null {
  if (!checklist) return null;
  const open = items.filter((i) => !i.checked);
  return {
    id: checklist.id,
    title: checklist.title,
    total: items.length,
    done: items.length - open.length,
    open: open.slice(0, HOW_MANY_OPEN_ITEMS).map((i) => ({
      id: i.id,
      label: i.label,
    })),
  };
}

/**
 * One round trip per concern. The home screen is opened constantly, so the
 * queries are narrow: counts and a handful of rows, never a whole table.
 */
export async function loadHomeSummary(
  tripId: string,
  todayISO: string
): Promise<HomeSummary> {
  const client = requireClient();

  const [trip, categories, expenses, checklists, destinations, days] =
    await Promise.all([
      client.from("trips").select("total_budget").eq("id", tripId).maybeSingle(),
      client.from("budget_categories").select("planned_amount").eq("trip_id", tripId),
      client.from("expenses").select("amount_ils").eq("trip_id", tripId),
      // The oldest list is the one the trip was planned around; a list made
      // later is usually a side list (packing, shopping) and not the deadline
      // one the home screen should lead with.
      client
        .from("checklists")
        .select("id, title")
        .eq("trip_id", tripId)
        .order("created_at")
        .limit(1),
      listDestinations(tripId).catch(() => [] as Destination[]),
      client
        .from("itinerary_days")
        .select("id, country_code, location_name")
        .eq("trip_id", tripId),
    ]);

  const budget: BudgetSummary = {
    ...resolveBudgetTotals(trip.data?.total_budget ?? null, categories.data ?? []),
    spent: (expenses.data ?? []).reduce((sum, e) => sum + (e.amount_ils ?? 0), 0),
  };

  const checklistRow = checklists.data?.[0] ?? null;
  const items = checklistRow
    ? await client
        .from("checklist_items")
        .select("id, label, checked")
        .eq("checklist_id", checklistRow.id)
        .order("sort_order")
    : { data: [] as { id: string; label: string; checked: boolean }[] };

  // Which days carry something, folded back onto their stretch.
  const dayRows = days.data ?? [];
  const withItems =
    dayRows.length === 0
      ? { data: [] as { day_id: string }[] }
      : await client
          .from("itinerary_items")
          .select("day_id")
          .in("day_id", dayRows.map((d) => d.id));
  const plannedDayIds = new Set((withItems.data ?? []).map((i) => i.day_id));

  const daysWithItemsByKey = new Map<string, number>();
  for (const d of dayRows) {
    if (!plannedDayIds.has(d.id) || !d.country_code || !d.location_name) continue;
    const key = `${d.country_code}::${d.location_name}`;
    daysWithItemsByKey.set(key, (daysWithItemsByKey.get(key) ?? 0) + 1);
  }

  return {
    // Hidden only when there is genuinely nothing to say: no categories AND no
    // declared target. A target with no categories yet is still worth showing.
    budget:
      (categories.data?.length ?? 0) > 0 || budget.hasTarget ? budget : null,
    checklist: buildChecklistPreview(checklistRow, items.data ?? []),
    timeline: buildTimeline(destinations, daysWithItemsByKey, todayISO),
  };
}
