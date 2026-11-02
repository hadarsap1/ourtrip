// Steps counter (Phase 2) - what the Home card shows. Pure, so tested.

export type StepRow = { member_id: string; date: string; steps: number };

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Steps for one member on one day, or null when the phone has not reported. */
export function stepsOn(rows: StepRow[], memberId: string, date: string): number | null {
  return rows.find((r) => r.member_id === memberId && r.date === date)?.steps ?? null;
}

/** The 7 days ending on `today`, oldest first, with each member's steps (0 when missing). */
export function weekBars(rows: StepRow[], memberIds: string[], today: string): { date: string; steps: Record<string, number> }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, steps: Object.fromEntries(memberIds.map((m) => [m, stepsOn(rows, m, date) ?? 0])) };
  });
}

/** Total per member between two dates inclusive (a country stay). */
export function totalBetween(rows: StepRow[], memberId: string, from: string, to: string): number {
  return rows.filter((r) => r.member_id === memberId && r.date >= from && r.date <= to).reduce((s, r) => s + r.steps, 0);
}

/** Bar height 0..1 against the week's best day (min scale 10k so a lazy week does not look heroic). */
export function barScale(bars: { steps: Record<string, number> }[]): number {
  return Math.max(10_000, ...bars.flatMap((b) => Object.values(b.steps)));
}

/**
 * Average adult stride, metres. Walking km are an estimate from steps only
 * (no GPS), so one fixed stride is honest enough and keeps it simple.
 */
export const STRIDE_M = 0.75;

/** Steps to km walked, one decimal. */
export function stepsToKm(steps: number): number {
  return Math.round((steps * STRIDE_M) / 100) / 10;
}

/**
 * The family's km on foot from `from` to `to`: the average over parents who
 * reported at least once in that range (the kids walk with them), or null when
 * no one reported.
 */
export function familyKm(rows: StepRow[], memberIds: string[], from: string, to: string): number | null {
  const reporting = memberIds.filter((m) => rows.some((r) => r.member_id === m && r.date >= from && r.date <= to));
  if (reporting.length === 0) return null;
  const avg = reporting.reduce((s, m) => s + totalBetween(rows, m, from, to), 0) / reporting.length;
  return stepsToKm(avg);
}
