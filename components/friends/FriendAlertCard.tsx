"use client";

import { useEffect, useState } from "react";
import { FRIEND_ALERT_DEFAULT_MINUTES, getFriendAlertMinutes, setFriendAlertMinutes } from "@/lib/data/friends";
import { strings } from "@/lib/strings";

const CHOICES = [5, 10, 15, 30, 60];

/** Parents: how long a message to a kid waits unread before one push tells
 *  them (00112). The database keeps it; owners only (RLS). */
export function FriendAlertCard({ tripId }: { tripId: string }) {
  const f = strings.friends;
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFriendAlertMinutes(tripId)
      .then((m) => alive && setMinutes(m))
      .catch(() => alive && setMinutes(FRIEND_ALERT_DEFAULT_MINUTES));
    return () => {
      alive = false;
    };
  }, [tripId]);

  async function choose(next: number) {
    if (busy || next === minutes) return;
    const before = minutes;
    setMinutes(next);
    setBusy(true);
    setNote(null);
    try {
      await setFriendAlertMinutes(tripId, next);
      setNote(f.alertSaved);
    } catch {
      setMinutes(before);
      setNote(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-lg font-bold text-ink">{f.alertTitle}</h2>
      <p className="text-sm text-ink-soft">{f.alertHint}</p>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-soft">{f.alertAfter}</legend>
        <div className="flex flex-wrap gap-1.5">
          {CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              disabled={minutes === null || busy}
              onClick={() => void choose(m)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${
                minutes === m ? "border-sea bg-sea text-on-sea font-bold" : "border-line text-ink"
              } disabled:opacity-60`}
            >
              {f.alertMinutes.replace("{n}", String(m))}
            </button>
          ))}
        </div>
      </fieldset>
      {note && (
        <p className="text-sm text-ink-soft" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
