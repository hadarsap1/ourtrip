"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { strings } from "@/lib/strings";

// Editing text after it was published (00076): journal, wall messages,
// comments. The database decides who may save and what a kid's edit does to
// an approval; this sheet only collects the words.
export function EditTextSheet({
  initial,
  onClose,
  onSave,
  maxLength,
}: {
  initial: string;
  onClose: () => void;
  /** throws on failure; the sheet stays open with the text */
  onSave: (text: string) => Promise<void>;
  maxLength?: number;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(false);
    try {
      await onSave(text.trim());
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={strings.editText.title}>
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={strings.editText.title}
          maxLength={maxLength}
          dir="auto"
          rows={6}
          className="block min-h-[9rem] w-full resize-y rounded-xl border border-line bg-surface p-3 text-[16px] leading-[1.6] text-ink focus:border-sea focus:outline-none"
        />
        {error && (
          <p className="text-sm text-alert" role="alert">
            {strings.common.error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !text.trim()}
            className="flex-1 rounded-xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60"
          >
            {strings.common.save}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-3 font-semibold text-ink-soft"
          >
            {strings.common.cancel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
