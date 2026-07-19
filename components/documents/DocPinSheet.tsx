"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { setDocPin, unlockDocPin } from "@/lib/data/docPin";
import { strings } from "@/lib/strings";

// mode "set": first-time PIN creation (with the unrecoverable warning).
// mode "enter": unlock the vault for this session.
export function DocPinSheet({
  mode,
  tripId,
  onClose,
  onUnlocked,
}: {
  mode: "set" | "enter";
  tripId: string;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const s = strings.documents;
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6,12}$/.test(pin)) {
      setError(s.pinInvalid);
      return;
    }
    if (mode === "set" && pin !== confirm) {
      setError(s.pinMismatch);
      return;
    }
    setBusy(true);
    try {
      if (mode === "set") {
        await setDocPin(tripId, pin);
      } else {
        const ok = await unlockDocPin(tripId, pin);
        if (!ok) {
          setError(s.pinWrong);
          setBusy(false);
          return;
        }
      }
      onUnlocked();
    } catch (err) {
      setError(
        (err as Error).message === "pin_exists" ? s.pinExists : strings.common.error
      );
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-line px-3 py-2 text-center text-lg tracking-widest focus:border-sea focus:outline-none";

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === "set" ? s.pinSetTitle : s.pinEnterTitle}
    >
      <form className="space-y-3" onSubmit={submit}>
        {mode === "set" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ {s.pinWarning}
          </div>
        )}
        <input
          className={field}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          placeholder={s.pinField}
          autoFocus
          dir="ltr"
        />
        {mode === "set" && (
          <input
            className={field}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            placeholder={s.pinConfirm}
            dir="ltr"
          />
        )}
        {mode === "set" && (
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span>{s.pinAck}</span>
          </label>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || (mode === "set" && !ack)}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white disabled:opacity-50"
        >
          {mode === "set" ? s.pinSave : s.pinUnlock}
        </button>
      </form>
    </Sheet>
  );
}
