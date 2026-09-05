"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  MIN_PASSPHRASE_LENGTH,
  setDocPin,
  unlockDocPin,
  unlockWithPasskey,
} from "@/lib/data/docPin";
import { isPasskeySupported } from "@/lib/webauthn";
import { WarningIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

// mode "set": first-time passphrase creation (with the unrecoverable warning).
// mode "enter": unlock the vault for this session - by biometric if this
// family has enrolled a device, otherwise by passphrase.
//
// Only "set" enforces the length rule. Vaults created before the 2026-08
// hardening were opened with a 6-digit PIN and must keep opening, so the
// unlock path takes whatever it is given and lets the verifier decide.
export function DocPinSheet({
  mode,
  tripId,
  hasPasskeys,
  onClose,
  onUnlocked,
}: {
  mode: "set" | "enter";
  tripId: string;
  hasPasskeys: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const s = strings.documents;
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    if (mode !== "enter" || !hasPasskeys) return;
    let alive = true;
    void isPasskeySupported().then((ok) => {
      if (alive) setBioAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, [mode, hasPasskeys]);

  const tryBiometric = useCallback(async () => {
    setError(null);
    setBusy(true);
    const result = await unlockWithPasskey(tripId).catch(() => "unsupported" as const);
    if (result === "ok") {
      onUnlocked();
      return;
    }
    setBusy(false);
    if (result === "cancelled") setError(s.bioCancelled);
    else if (result === "no_passkeys") setBioAvailable(false);
    else setError(s.bioFailed);
  }, [tripId, onUnlocked, s.bioCancelled, s.bioFailed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "set") {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        setError(s.pinInvalid);
        return;
      }
      if (passphrase !== confirm) {
        setError(s.pinMismatch);
        return;
      }
    } else if (passphrase.length === 0) {
      return;
    }
    setBusy(true);
    try {
      if (mode === "set") {
        await setDocPin(tripId, passphrase);
      } else {
        const ok = await unlockDocPin(tripId, passphrase);
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
    "w-full rounded-xl border border-line px-3 py-2 text-center text-lg focus:border-sea focus:outline-none";

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === "set" ? s.pinSetTitle : s.pinEnterTitle}
    >
      {mode === "enter" && bioAvailable && (
        <div className="mb-4 space-y-3">
          <button
            type="button"
            onClick={() => void tryBiometric()}
            disabled={busy}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-white disabled:opacity-50"
          >
            {s.bioUnlock}
          </button>
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="h-px flex-1 bg-line" />
            {s.bioOr}
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}

      <form className="space-y-3" onSubmit={submit}>
        {mode === "set" && (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <WarningIcon className="inline-block h-4 w-4 align-text-bottom" /> {s.pinWarning}
            </div>
            <p className="text-sm text-ink-soft">{s.pinHint}</p>
          </>
        )}

        <input
          className={field}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          type={reveal ? "text" : "password"}
          autoComplete={mode === "set" ? "new-password" : "current-password"}
          placeholder={s.pinField}
          autoFocus={mode === "set" || !bioAvailable}
          dir="ltr"
        />
        {mode === "set" && (
          <input
            className={field}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            placeholder={s.pinConfirm}
            dir="ltr"
          />
        )}
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="text-sm text-ink-soft underline"
        >
          {reveal ? s.pinHide : s.pinShow}
        </button>

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
