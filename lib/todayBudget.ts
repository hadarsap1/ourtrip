// "נשאר להיום" (1.6): how much of today's share of the budget is still free.
// Today's share = what was left at the start of today, spread evenly over the
// days still to go (today included). Before the trip, the days still to go are
// the whole trip. Pure, so it is tested.

const DAY_MS = 86_400_000;

function daysInclusive(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.floor((b - a) / DAY_MS) + 1;
}

export type TodayAllowance = { dailyShare: number; leftToday: number; daysLeft: number } | null;

export function todayAllowance(args: {
  remaining: number; // budget minus everything spent so far (today included)
  spentToday: number;
  today: string;
  start: string | null;
  end: string | null;
}): TodayAllowance {
  const { remaining, spentToday, today, start, end } = args;
  if (!end || today > end) return null;
  const from = start && today < start ? start : today;
  const daysLeft = daysInclusive(from, end);
  if (daysLeft <= 0) return null;
  const atStartOfToday = remaining + (today >= (start ?? today) ? spentToday : 0);
  const dailyShare = Math.max(0, atStartOfToday / daysLeft);
  return { dailyShare, leftToday: dailyShare - (today >= (start ?? today) ? spentToday : 0), daysLeft };
}
