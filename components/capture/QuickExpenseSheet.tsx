"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createExpenseOrQueue, listCategories } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { getTodayCountryCode } from "@/lib/data/today";
import { currencyForCountry } from "@/lib/currencies";
import { queryKeys, readQuery } from "@/lib/offline/queryCache";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { BudgetCategory } from "@/lib/types";

const LAST_CURRENCY_KEY = "ourtrip-last-currency"; // shared with ExpenseFormSheet
const LAST_CATEGORY_KEY = "ourtrip-last-category";

/** Currency chips: last used first, then today's local currency, USD, ILS. Pure. */
export function currencyChips(last: string | null, local: string | null): string[] {
  return [...new Set([last, local, "USD", "ILS"].filter((c): c is string => Boolean(c)))].slice(0, 4);
}

/** Appends a keypad key to the amount string, keeping it a valid number. Pure. */
export function pressKey(amount: string, key: string): string {
  if (key === "⌫") return amount.slice(0, -1);
  if (key === ".") return amount.includes(".") ? amount : (amount || "0") + ".";
  if (amount.includes(".") && amount.split(".")[1].length >= 2) return amount;
  if (amount === "0") return key === "000" ? "0" : key;
  const next = amount + key;
  return next.replace(/\./g, "").length > 9 ? amount : next;
}

/**
 * FAB → expense (1.7): amount keypad, currency chips (last used first),
 * category chips. Works offline: categories come from the budget cache and the
 * save queues. "Who paid" needs a column the schema does not have yet
 * (proposed in docs/upgrade/PLAN.md) - every expense is still recorded with
 * the member who entered it.
 */
export function QuickExpenseSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [chips, setChips] = useState<string[]>(["USD", "ILS"]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const trip = await getActiveTrip();
      if (!trip || !alive) return;
      let last: string | null = null;
      let lastCat: string | null = null;
      try {
        last = localStorage.getItem(LAST_CURRENCY_KEY);
        lastCat = localStorage.getItem(LAST_CATEGORY_KEY);
      } catch {
        // non-essential
      }
      const local = currencyForCountry(await getTodayCountryCode(trip.id).catch(() => null));
      const list = currencyChips(last, local);
      let cats: BudgetCategory[] = [];
      try {
        cats = await listCategories(trip.id);
      } catch {
        cats = (await readQuery<{ cats: BudgetCategory[] }>(queryKeys.budget(trip.id)))?.data.cats ?? [];
      }
      if (!alive) return;
      setChips(list);
      setCurrency(list[0]);
      setCategories(cats);
      setCategoryId(cats.some((c) => c.id === lastCat) ? (lastCat as string) : (cats[0]?.id ?? ""));
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  async function save() {
    const value = Number(amount);
    if (!categoryId || !Number.isFinite(value) || value <= 0 || saving) return;
    setSaving(true);
    try {
      const result = await createExpenseOrQueue({ categoryId, amount: value, currency, spentOn: todayISO() });
      try {
        localStorage.setItem(LAST_CURRENCY_KEY, currency);
        localStorage.setItem(LAST_CATEGORY_KEY, categoryId);
      } catch {
        // non-essential
      }
      setAmount("");
      onDone(result === "queued" ? strings.budget.expenseQueued : strings.budget.expenseSaved);
    } catch (e) {
      onDone(e instanceof Error && e.message === "fx" ? strings.budget.fxError : strings.common.error);
    } finally {
      setSaving(false);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

  return (
    <Sheet open={open} onClose={onClose} title={strings.capture.expenseTitle}>
      <div className="space-y-4">
        <p aria-live="polite" className="text-center text-[40px] font-extrabold leading-[48px] tabular-nums text-ink">
          <bdi>
            {amount || "0"} {currency}
          </bdi>
        </p>

        <div role="radiogroup" aria-label={strings.capture.currency} className="flex flex-wrap justify-center gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === currency}
              onClick={() => setCurrency(c)}
              className={`rounded-full px-4 text-sm font-bold ${c === currency ? "border-[1.5px] border-sea bg-sea-tint text-sea-deep" : "border border-line bg-surface text-ink"}`}
            >
              <bdi>{c}</bdi>
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label={strings.capture.category} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === categoryId}
              onClick={() => setCategoryId(c.id)}
              className={`shrink-0 rounded-full px-3.5 text-sm font-semibold ${c.id === categoryId ? "bg-sea text-on-sea" : "border border-line bg-surface text-ink"}`}
            >
              {c.label_he}
            </button>
          ))}
          {categories.length === 0 && <span className="text-sm text-ink-soft">{strings.capture.noCategories}</span>}
        </div>

        <div dir="ltr" className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={k === "⌫" ? strings.capture.backspace : k}
              onClick={() => setAmount((a) => pressKey(a, k))}
              className="h-[52px] rounded-lg bg-paper-deep text-2xl font-semibold tabular-nums text-ink active:bg-line"
            >
              {k}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !categoryId || !Number(amount)}
          className="w-full rounded-xl bg-sea py-3 text-base font-semibold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft"
        >
          {strings.capture.save}
        </button>
      </div>
    </Sheet>
  );
}
