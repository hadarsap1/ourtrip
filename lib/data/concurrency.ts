// Optimistic concurrency for owner edits (audit S-3).
//
// SPEC §3 specifies last-write-wins PLUS a warning when the server version
// changed since the row was read: "עודכן גם ממכשיר אחר - בדקו את הפריט".
// The warning half was never built, so with two owners planning the same
// itinerary in parallel, one edit silently overwrote the other.
//
// Every editable table already carries `updated_at` maintained by the
// `set_updated_at` trigger, which makes it a ready-made version token: guard
// the UPDATE on the value that was read, and a zero-row result means someone
// else wrote first. This stays last-write-wins — the edit is not blocked, the
// person is told and shown the current state so they can decide.

const CONFLICT = "conflict";

export function conflictError(): Error {
  return new Error(CONFLICT);
}

export function isConflictError(e: unknown): boolean {
  return e instanceof Error && e.message === CONFLICT;
}

/**
 * Interprets the result of a guarded update.
 *
 * A zero-row result can also mean the row was deleted, or that RLS rejected
 * the write. All three deserve the same response — stop, refetch, look at what
 * is actually there — so they are deliberately not distinguished.
 */
export function assertMatched(
  matched: number,
  expectedUpdatedAt: string | undefined
): void {
  if (expectedUpdatedAt && matched === 0) throw conflictError();
}
