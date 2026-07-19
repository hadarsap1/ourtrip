"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { CURRENCIES } from "@/lib/currencies";
import {
  createExpenseOrQueue,
  deleteExpense,
  updateExpense,
} from "@/lib/data/expenses";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { BudgetCategory, Expense } from "@/lib/types";

const LAST_CURRENCY_KEY = "ourtrip-last-currency";

const labelClass = "mb-1 block text-sm font-medium text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

export function ExpenseFormSheet({
  open,
  expense,
  categories,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  expense: Expense | null;
  categories: BudgetCategory[];
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  if (!open) return null;
  // key remounts the form per expense, so state initializes from props cleanly
  return (
    <ExpenseForm
      key={expense?.id ?? "new"}
      expense={expense}
      categories={categories}
      onClose={onClose}
      onDone={onDone}
      onError={onError}
    />
  );
}

function ExpenseForm({
  expense,
  categories,
  onClose,
  onDone,
  onError,
}: {
  expense: Expense | null;
  categories: BudgetCategory[];
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isNew = expense === null;
  const [amount, setAmount] = useState(
    expense ? String(expense.amount) : ""
  );
  const [currency, setCurrency] = useState<string>(() => {
    if (expense) return expense.currency;
    try {
      return localStorage.getItem(LAST_CURRENCY_KEY) ?? "ILS";
    } catch {
      return "ILS";
    }
  });
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? todayISO());
  const [saving, setSaving] = useState(false);

  function rememberCurrency(c: string) {
    try {
      localStorage.setItem(LAST_CURRENCY_KEY, c);
    } catch {
      // private mode etc. — non-essential
    }
  }

  async function save(catId: string) {
    const value = Number(amount);
    if (!catId || !Number.isFinite(value) || value <= 0 || saving) return;
    setSaving(true);
    try {
      if (isNew) {
        const result = await createExpenseOrQueue({
          categoryId: catId,
          amount: value,
          currency,
          description,
          spentOn,
        });
        rememberCurrency(currency);
        onDone(
          result === "queued"
            ? strings.budget.expenseQueued
            : strings.budget.expenseSaved
        );
        return;
      }
      await updateExpense(expense.id, {
        category_id: catId,
        amount: value,
        currency,
        description: description.trim() || null,
        spent_on: spentOn,
      });
      rememberCurrency(currency);
      onDone(strings.budget.expenseSaved);
    } catch (e) {
      onError(
        e instanceof Error && e.message === "fx"
          ? strings.budget.fxError
          : strings.common.error
      );
      setSaving(false);
    }
  }

  function handleDelete() {
    if (isNew || saving) return;
    if (!confirm(strings.budget.deleteExpenseConfirm)) return;
    setSaving(true);
    deleteExpense(expense.id)
      .then(() => onDone(strings.budget.expenseSaved))
      .catch(() => {
        onError(strings.common.error);
        setSaving(false);
      });
  }

  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? strings.budget.addExpense : strings.budget.editExpense}
    >
      <div className="space-y-4">
        {/* 1. amount — pre-focused, numeric keyboard */}
        <div>
          <label htmlFor="exp-amount" className={labelClass}>
            {strings.budget.amount}
          </label>
          <input
            id="exp-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} text-2xl font-bold`}
            dir="ltr"
          />
        </div>

        {/* 2. currency chips — last used is preselected */}
        <div>
          <span className={labelClass}>{strings.budget.currency}</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1" dir="ltr">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  currency === c
                    ? "bg-sea text-white"
                    : "bg-paper-deep text-ink-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 3. category — on a new expense, tapping saves immediately */}
        <div>
          <span className={labelClass}>
            {strings.budget.category}
            {isNew && (
              <span className="mr-1 text-xs font-normal text-ink-soft">
                · {strings.budget.categoryTapHint}
              </span>
            )}
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                disabled={saving || (isNew && !amountValid)}
                onClick={() => {
                  setCategoryId(cat.id);
                  if (isNew) void save(cat.id);
                }}
                className={`rounded-xl px-2 py-2.5 text-sm font-semibold disabled:opacity-40 ${
                  categoryId === cat.id
                    ? "bg-sea text-white"
                    : "bg-paper-deep text-ink"
                }`}
              >
                {cat.label_he}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="exp-desc" className={labelClass}>
              {strings.budget.description}
            </label>
            <input
              id="exp-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="exp-date" className={labelClass}>
              {strings.budget.date}
            </label>
            <input
              id="exp-date"
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>
        </div>

        {!isNew && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !amountValid || !categoryId}
              onClick={() => void save(categoryId)}
              className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
            >
              {strings.common.save}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              {strings.common.delete}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
