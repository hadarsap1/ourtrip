"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { PaymentPicker, type QuickPayment } from "@/components/budget/PaymentPicker";
import { createExpenses, ensureCashCategory, getRateToIls } from "@/lib/data/expenses";
import { getActiveTrip } from "@/lib/data/trip";
import { getTodayCountryCode } from "@/lib/data/today";
import { currencyForCountry } from "@/lib/currencies";
import { formatMoney, todayISO } from "@/lib/format";
import { parseExpenseLines } from "@/lib/parseExpenseLines";
import { CASH_CATEGORY_KEY, pickableCategories } from "@/lib/budget";
import { strings } from "@/lib/strings";
import type { BudgetCategory } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

/** Free-text batch entry: one expense per line, parsed live, saved in one go. */
export function QuickLinesSheet({
  categories,
  defaultCategoryId,
  onClose,
  onDone,
  onError,
}: {
  categories: BudgetCategory[];
  defaultCategoryId: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const s = strings.budget;
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [spentOn, setSpentOn] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  // the whole batch: regular, paid in cash (each line from its currency's
  // cash), or ATM withdrawals under the cash category
  const [payment, setPayment] = useState<QuickPayment>("regular");
  // a line with no currency written is in today's local one (Hadar
  // 24/11/2026: "קפה 45000" in Vietnam is dong, not shekels)
  const [localCurrency, setLocalCurrency] = useState("ILS");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const trip = await getActiveTrip().catch(() => null);
      if (!trip) return;
      const local = currencyForCountry(await getTodayCountryCode(trip.id).catch(() => null));
      if (alive && local) setLocalCurrency(local);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { lines, unparsed } = useMemo(() => parseExpenseLines(text, localCurrency), [text, localCurrency]);

  // Every line in shekels at the chosen day's rate - the same rate the save
  // stores in amount_ils (getRateToIls is cached per currency and day).
  const [rates, setRates] = useState<Map<string, number | null>>(new Map());
  const currencies = useMemo(() => [...new Set(lines.map((l) => l.currency))].sort().join(","), [lines]);
  useEffect(() => {
    if (!currencies) return;
    let alive = true;
    void Promise.all(
      currencies.split(",").map(async (c) => [c, await getRateToIls(c, spentOn).catch(() => null)] as const)
    ).then((pairs) => {
      if (alive) setRates(new Map(pairs.map(([c, r]) => [`${c}|${spentOn}`, r])));
    });
    return () => {
      alive = false;
    };
  }, [currencies, spentOn]);
  const ilsOf = (amount: number, currency: string): number | null => {
    const rate = rates.get(`${currency}|${spentOn}`);
    return rate == null ? null : Math.round(amount * rate * 100) / 100;
  };
  const ilsLines = lines.map((l) => ilsOf(l.amount, l.currency));
  const ilsTotal = ilsLines.every((v) => v !== null) ? ilsLines.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;

  async function save() {
    if (saving || lines.length === 0) return;
    setSaving(true);
    try {
      const isWithdrawal = payment === "withdrawal";
      // a withdrawal always goes under "מזומן" (00097), as in the full form
      const catId = isWithdrawal
        ? (categories.find((c) => c.key === CASH_CATEGORY_KEY)?.id ?? (await ensureCashCategory(categories[0].trip_id)))
        : categoryId;
      const { saved, failed } = await createExpenses(lines, {
        categoryId: catId,
        spentOn,
        isCashWithdrawal: isWithdrawal,
        paidInCash: payment === "cash",
      });
      const parts = [s.quickLinesSaved.replace("{n}", String(saved))];
      if (failed.length > 0) {
        parts.push(s.quickLinesSomeFx.replace("{n}", String(failed.length)));
      }
      onDone(parts.join(" · "));
    } catch {
      onError(strings.common.error);
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.quickLinesTitle}>
      <div className="space-y-4">
        <p className="whitespace-pre-line text-xs leading-relaxed text-ink-soft">
          {s.quickLinesHint}
        </p>
        <p className="text-xs font-medium text-ink-soft">
          {s.quickLinesLocalHint.split("{currency}")[0]}
          <bdi>{localCurrency}</bdi>
        </p>

        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={s.quickLinesPlaceholder}
          className={inputClass}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          {payment !== "withdrawal" && (
          <div>
            <label htmlFor="ql-category" className={labelClass}>
              {s.category}
            </label>
            <select
              id="ql-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              {pickableCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label_he}
                </option>
              ))}
            </select>
          </div>
          )}
          <div>
            <label htmlFor="ql-date" className={labelClass}>
              {s.date}
            </label>
            <input
              id="ql-date"
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <PaymentPicker value={payment} onChange={setPayment} />
          {payment !== "regular" && (
            <p className="text-center text-xs text-ink-soft">
              {payment === "cash" ? s.quickLinesPaymentHintCash : s.quickLinesPaymentHintWithdrawal}
            </p>
          )}
        </div>

        {/* live preview of what will be created */}
        {lines.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-2">
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {lines.map((l, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-2 rounded-lg bg-surface px-2 py-1.5 text-sm shadow-sm"
                >
                  <span className="min-w-0 truncate text-ink">{l.description || "-"}</span>
                  <span className="shrink-0 text-end">
                    <span className="block font-semibold text-sea-deep">
                      <bdi>{formatMoney(l.amount, l.currency)}</bdi>
                    </span>
                    {l.currency !== "ILS" && (
                      <span className="block text-xs text-ink-soft">
                        <bdi>{ilsLines[i] !== null ? `≈ ${formatMoney(Math.round(ilsLines[i] as number), "ILS")}` : s.quickLinesNoRate}</bdi>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-xs font-medium text-ink-soft">
              {ilsTotal !== null ? (
                <>
                  {s.quickLinesTotalIls.split("{amount}")[0].replace("{n}", String(lines.length))}
                  <bdi>{formatMoney(Math.round(ilsTotal), "ILS")}</bdi>
                </>
              ) : (
                s.quickLinesTotal.replace("{n}", String(lines.length))
              )}
            </p>
          </div>
        )}

        {unparsed.length > 0 && (
          <p className="text-xs text-sun-deep">
            {s.quickLinesUnparsed.replace("{n}", String(unparsed.length))}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || lines.length === 0}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-50"
        >
          {saving ? s.quickLinesSaving : s.quickLinesSave}
        </button>
      </div>
    </Sheet>
  );
}
