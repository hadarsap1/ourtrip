"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { importIntoChecklist } from "@/lib/data/checklists";
import { parseSheet, toLabels } from "@/lib/importFile";
import { strings } from "@/lib/strings";
import type { Checklist } from "@/lib/types";

export function ImportChecklistSheet({
  tripId,
  lists,
  onClose,
  onDone,
}: {
  tripId: string;
  lists: Checklist[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const s = strings.checklists;
  const [target, setTarget] = useState<string>("__new__");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nonTemplateLists = lists.filter((l) => !l.is_template);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await parseSheet(file);
      const labels = toLabels(rows);
      if (labels.length === 0) {
        setError(s.importEmpty);
        setBusy(false);
        return;
      }
      const { count } = await importIntoChecklist({
        tripId,
        targetListId: target === "__new__" ? null : target,
        newTitle: target === "__new__" ? newTitle : null,
        fallbackTitle: s.importFallbackTitle,
        labels,
      });
      onDone(s.imported.replace("{n}", String(count)));
    } catch {
      setError(s.importFailed);
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-teal-500 focus:outline-none";

  return (
    <Sheet open onClose={onClose} title={s.importTitle}>
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-sm text-slate-500">{s.importHint}</p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">
            {s.importTargetExisting}
          </span>
          <select
            className={field}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="__new__">— {s.importTargetNew} —</option>
            {nonTemplateLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>

        {target === "__new__" && (
          <input
            className={field}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={s.importNewTitlePlaceholder}
          />
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-700"
        />

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? strings.common.loading : s.importDo}
        </button>
      </form>
    </Sheet>
  );
}
