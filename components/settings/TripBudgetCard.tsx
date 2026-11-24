"use client";

import { useCallback, useEffect, useState } from "react";
import { TotalBudgetSheet } from "@/components/budget/TotalBudgetSheet";
import { CASH_CATEGORY_KEY } from "@/lib/budget";
import { getTripTotalBudget, listCategories } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { formatMoney } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";

const t = strings.tripBudgetSettings;

/**
 * The trip's overall budget target, set here (Hadar 24/11/2026): the budget
 * screen only mentions it in a quiet line. Parents only - trip_budget is
 * owner-only in RLS (00056), so for anyone else the card stays hidden.
 */
export function TripBudgetCard() {
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [planned, setPlanned] = useState(0);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (tripId: string) => {
    const [value, cats] = await Promise.all([getTripTotalBudget(tripId), listCategories(tripId)]);
    setTotal(value);
    setPlanned(cats.filter((c) => c.key !== CASH_CATEGORY_KEY).reduce((sum, c) => sum + (c.planned_amount ?? 0), 0));
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void (async () => {
      try {
        const active = await getActiveTrip();
        if (!active || !alive) return;
        setTrip(active);
        await load(active.id);
      } catch {
        // offline: the card stays hidden until it can load
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOwner, load]);

  if (!isOwner || !trip) return null;

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-base font-bold text-ink">{t.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.hint}</p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-3 flex min-h-[44px] w-full items-baseline justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-start"
      >
        <span className="text-base font-medium text-ink">{strings.budget.target}</span>
        <span className="shrink-0 text-sm text-ink-soft">
          <bdi>{total != null && total > 0 ? formatMoney(Math.round(total), "ILS") : t.notSet}</bdi>
        </span>
      </button>
      {note && (
        <p className="mt-2 text-sm text-ink-soft" role="status">
          {note}
        </p>
      )}
      {editing && (
        <TotalBudgetSheet
          trip={trip}
          totalBudget={total}
          planned={planned}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            setNote(t.saved);
            void load(trip.id).catch(() => {});
          }}
          onError={() => setNote(strings.common.error)}
        />
      )}
    </section>
  );
}
