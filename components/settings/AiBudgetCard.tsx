"use client";

import { useEffect, useState } from "react";
import { getAiBudget, parseAiBudget, setAiBudget } from "@/lib/data/aiBudget";
import { getActiveTrip } from "@/lib/data/trip";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.aiBudget;

/**
 * The monthly AI budget (migration 00053), parents only. Every AI action stops
 * once the month's estimated spend reaches it; raising it here lets them run
 * again at once. Enforced in the Edge Functions (ai_reserve), not here.
 */
export function AiBudgetCard() {
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const [tripId, setTripId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void (async () => {
      try {
        const trip = await getActiveTrip();
        if (!trip || !alive) return;
        const usd = await getAiBudget(trip.id);
        if (!alive) return;
        setTripId(trip.id);
        setValue(String(usd));
      } catch {
        // offline or not configured: the card stays hidden until it can load
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOwner]);

  if (!isOwner || !tripId) return null;

  async function save() {
    const usd = parseAiBudget(value);
    if (usd === null) {
      setNote(t.invalid);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await setAiBudget(tripId!, usd);
      setValue(String(usd));
      setNote(t.saved);
    } catch {
      setNote(t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.title}</h2>
      <p className="mt-1 text-[12px] text-ink-soft">{t.hint}</p>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-soft">
          {t.label}
          <span className="flex min-h-[44px] items-center gap-1 rounded-xl border border-line bg-surface px-3" dir="ltr">
            <span className="text-base text-ink-soft">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-transparent text-base text-ink outline-none"
              aria-label={t.label}
            />
          </span>
        </label>
        <button type="submit" disabled={busy} className="min-h-[44px] rounded-xl bg-sea px-4 text-sm font-bold text-on-sea disabled:opacity-60">
          {busy ? t.saving : t.save}
        </button>
      </form>
      {note && (
        <p role="status" className="mt-2 text-sm font-semibold text-ink-soft">
          {note}
        </p>
      )}
    </section>
  );
}
