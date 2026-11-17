"use client";

import { useCallback, useEffect, useState } from "react";
import { CategorySheet } from "@/components/budget/CategorySheet";
import { CASH_CATEGORY_KEY } from "@/lib/budget";
import { listCategories } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { formatMoney } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";
import type { BudgetCategory } from "@/lib/types";

const t = strings.budgetCategoriesSettings;

/**
 * Budget categories - add, rename, set a planned amount, delete. Moved here
 * from the budget screen, where tapping a category now lists its expenses.
 * Parents only (the tables are owner-only in RLS). The cash-withdrawal
 * category is the app's own and is not listed.
 */
export function BudgetCategoriesCard() {
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const [tripId, setTripId] = useState<string | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [form, setForm] = useState<{ category: BudgetCategory | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setCategories(await listCategories(id));
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void (async () => {
      try {
        const trip = await getActiveTrip();
        if (!trip || !alive) return;
        setTripId(trip.id);
        const cats = await listCategories(trip.id);
        if (alive) setCategories(cats);
      } catch {
        // offline: the card stays hidden until it can load
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOwner]);

  if (!isOwner || !tripId) return null;
  const shown = categories.filter((c) => c.key !== CASH_CATEGORY_KEY);

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="text-base font-bold text-ink">{t.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.hint}</p>
      <ul className="mt-3 overflow-hidden rounded-xl border border-line">
        {shown.map((c) => (
          <li key={c.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => setForm({ category: c })}
              className="flex min-h-[44px] w-full items-baseline justify-between gap-3 px-3 py-2.5 text-start"
            >
              <span className="min-w-0 truncate text-base font-medium text-ink">{c.label_he}</span>
              <span className="shrink-0 text-sm text-ink-soft">
                <bdi>{c.planned_amount > 0 ? formatMoney(Math.round(c.planned_amount), "ILS") : t.noPlan}</bdi>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setForm({ category: null })}
        className="mt-3 min-h-[44px] rounded-full px-3 text-sm font-bold text-sea"
      >
        + {strings.budget.addCategory}
      </button>
      {note && <p className="mt-1 text-sm text-alert">{note}</p>}
      {form && (
        <CategorySheet
          key={form.category?.id ?? "new"}
          tripId={tripId}
          category={form.category}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            setNote(null);
            void load(tripId).catch(() => setNote(strings.common.error));
          }}
          onError={(message) => setNote(message ?? strings.common.error)}
        />
      )}
    </section>
  );
}
