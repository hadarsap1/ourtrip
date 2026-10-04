"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createBooking } from "@/lib/data/bookings";
import { extractBookingFromPaste, pasteToInsert, type PasteBooking } from "@/lib/data/bookingPaste";
import { isLowConfidence, PASTE_TYPES, type PasteField } from "@/supabase/functions/_shared/bookingPaste";
import { strings } from "@/lib/strings";

const t = strings.bookingPaste;
const errorText = (code: string) => (t.errors as Record<string, string>)[code] ?? t.errors.extract_failed;

type EditableField = Exclude<PasteField, "type" | "cost">;
const TEXT_FIELDS: { key: EditableField; input: "text" | "date" | "time" }[] = [
  { key: "title", input: "text" },
  { key: "start_date", input: "date" },
  { key: "end_date", input: "date" },
  { key: "start_time", input: "time" },
  { key: "end_time", input: "time" },
  { key: "confirmation_code", input: "text" },
  { key: "currency", input: "text" },
  { key: "provider", input: "text" },
  { key: "flight_number", input: "text" },
  { key: "terminal", input: "text" },
  { key: "address", input: "text" },
];

/**
 * Paste-to-import (2.1): paste a confirmation, the booking-paste function
 * returns one booking with a confidence per field, the owner reviews every
 * field (low-confidence ones flagged) and saves. Nothing is saved before that.
 */
export function PasteImportSheet({
  open,
  tripId,
  onClose,
  onDone,
}: {
  open: boolean;
  tripId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PasteBooking | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  function reset() {
    setDraft(null);
    setError(null);
  }

  async function extract() {
    if (busy || text.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const r = await extractBookingFromPaste(text);
      setRemaining(r.remainingToday);
      if (!r.booking) setError(t.notFound);
      setDraft(r.booking);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || busy || !draft.title.trim()) return;
    setBusy(true);
    try {
      await createBooking(pasteToInsert(tripId, draft));
      setText("");
      reset();
      onDone(t.saved);
    } catch {
      setError(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof PasteBooking>(key: K, value: PasteBooking[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value, confidence: { ...d.confidence, [key]: 1 } } : d));
  const flag = (f: PasteField) => (draft && isLowConfidence(draft, f) ? "border-warning bg-warning-soft" : "border-line bg-surface");
  const field = "w-full rounded-xl border px-3 py-2 text-base text-ink";

  return (
    <Sheet open={open} onClose={onClose} title={draft ? t.reviewTitle : t.title}>
      {!draft ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-soft">{t.hint}</p>
          <label className="block">
            <span className="sr-only">{t.title}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={t.placeholder}
              className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-base text-ink"
              dir="auto"
            />
          </label>
          {error && <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">{error}</p>}
          <button
            type="button"
            onClick={() => void extract()}
            disabled={busy || text.trim().length < 20}
            className="w-full rounded-xl bg-sea py-3 text-base font-bold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft"
          >
            {busy ? t.extracting : t.extract}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.values(draft.confidence).some((c) => c !== undefined && c < 0.7) && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning">{t.lowConfidenceHint}</p>
          )}
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              {t.fields.type}
              {isLowConfidence(draft, "type") && <span className="rounded bg-warning px-1.5 text-[12px] text-surface">{t.lowConfidence}</span>}
            </span>
            <select value={draft.type} onChange={(e) => set("type", e.target.value as PasteBooking["type"])} className={`${field} ${flag("type")}`}>
              {PASTE_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {strings.bookings.types[ty]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
              {t.fields.cost}
              {isLowConfidence(draft, "cost") && <span className="rounded bg-warning px-1.5 text-[12px] text-surface">{t.lowConfidence}</span>}
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={draft.cost ?? ""}
              onChange={(e) => set("cost", e.target.value === "" ? null : Number(e.target.value))}
              className={`${field} ${flag("cost")}`}
              dir="ltr"
            />
          </label>
          {TEXT_FIELDS.map(({ key, input }) => (
            <label key={key} className="block">
              <span className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
                {t.fields[key]}
                {isLowConfidence(draft, key) && <span className="rounded bg-warning px-1.5 text-[12px] text-surface">{t.lowConfidence}</span>}
              </span>
              <input
                type={input}
                value={(draft[key] as string | null) ?? ""}
                onChange={(e) => set(key, (e.target.value || null) as PasteBooking[typeof key])}
                className={`${field} ${flag(key)}`}
                dir={input === "text" && key !== "title" && key !== "address" ? "ltr" : "auto"}
              />
            </label>
          ))}
          {draft.notes && <p className="rounded-xl bg-paper-deep px-3 py-2 text-[13px] text-ink">{draft.notes}</p>}
          {error && <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">{error}</p>}
          {remaining !== null && <p className="text-[12px] text-ink-soft">{t.remaining.replace("{n}", String(remaining))}</p>}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !draft.title.trim()}
              className="rounded-xl bg-sea py-3 text-base font-bold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft"
            >
              {t.save}
            </button>
            <button type="button" onClick={reset} className="rounded-xl border border-line bg-surface py-3 text-base font-bold text-ink">
              {t.again}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
