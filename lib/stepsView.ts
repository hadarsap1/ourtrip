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
