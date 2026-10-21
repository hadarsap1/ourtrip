// A fresh realtime channel name per subscription. supabase-js reuses an
// existing channel when the name matches, so a screen that re-subscribed while
// its previous channel was still being removed got the old, already-subscribed
// channel back, and adding listeners to it throws ("cannot add
// postgres_changes callbacks ... after subscribe()") - a page crash found in
// QA. postgres_changes delivery does not depend on the name.
let seq = 0;
export function realtimeTopic(base: string): string {
  seq += 1;
  return `${base}:${Date.now().toString(36)}-${seq}`;
}

// A refetch triggered by realtime reaches every open screen at the same
// moment. Spreading it over a window of a few times the base delay keeps a
// crowd of readers from hitting the database in one spike.
export function spreadDelay(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs * 4);
}
