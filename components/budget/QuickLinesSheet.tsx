"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createExpenses } from "@/lib/data/expenses";
import { formatMoney, todayISO } from "@/lib/format";
import { parseExpenseLines } from "@/lib/parseExpenseLines";
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

  const { lines, unparsed } = useMemo(() => parseExpenseLines(text), [text]);

  async function save() {
    if (saving || lines.length === 0) return;
    setSaving(true);
    try {
      const { saved, failed } = await createExpenses(lines, { categoryId, spentOn });
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

        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={s.quickLinesPlaceholder}
          className={inputClass}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label_he}
                </option>
              ))}
            </select>
          </div>
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

        {/* live preview of what will be created */}
        {lines.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-2">
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {lines.map((l, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-sm shadow-sm"
                >
                  <span className="truncate text-ink">{l.description || "-"}</span>
                  <span className="shrink-0 font-semibold text-sea-deep" dir="ltr">
                    {formatMoney(l.amount, l.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-xs font-medium text-ink-soft">
              {s.quickLinesTotal.replace("{n}", String(lines.length))}
            </p>
          </div>
        )}

        {unparsed.length > 0 && (
          <p className="text-xs text-amber-700">
            {s.quickLinesUnparsed.replace("{n}", String(unparsed.length))}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || lines.length === 0}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? s.quickLinesSaving : s.quickLinesSave}
        </button>
      </div>
    </Sheet>
  );
}
