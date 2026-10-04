// F4: runs of empty days collapse into one group row. Pure, so it is tested.

export type DayLike = { id: string; date: string };

export type DayBlock<T extends DayLike> =
  | { kind: "day"; day: T }
  | { kind: "empty-run"; days: T[]; from: string; to: string };

/**
 * Splits a leg's days into single days and runs of 2+ consecutive empty days.
 * Today is never hidden inside a run: it always stands on its own, so the
 * floating "היום" button and the calendar jump always have a target.
 */
export function groupEmptyRuns<T extends DayLike>(
  days: T[],
  isEmpty: (day: T) => boolean,
  today: string,
  minRun = 2
): DayBlock<T>[] {
  const out: DayBlock<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length >= minRun) out.push({ kind: "empty-run", days: run, from: run[0].date, to: run[run.length - 1].date });
    else for (const d of run) out.push({ kind: "day", day: d });
    run = [];
  };
  for (const day of days) {
    if (isEmpty(day) && day.date !== today) {
      run.push(day);
    } else {
      flush();
      out.push({ kind: "day", day });
    }
  }
  flush();
  return out;
}
