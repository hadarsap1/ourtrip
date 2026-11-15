"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addCashAdjustment } from "@/lib/data/cashAdjustments";
import { isConnectivityError } from "@/lib/data/expenses";
import { adjustmentDelta, type CashWallet } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-lg font-semibold outline-none focus:border-sea";

/** Sets the cash wallet of one currency to what was counted in it (00092,
 *  DECISIONS #61). Only the wallet moves; the budget totals do not. */
export function CashWalletSheet({
  wallet,
  onClose,
  onDone,
  onError,
}: {
  wallet: CashWallet;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const s = strings.budget;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = Number(value.replace(/,/g, ""));
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await addCashAdjustment({
        currency: wallet.currency,
        balance: Math.round(parsed * 100) / 100,
        delta: adjustmentDelta(wallet.raw, parsed),
      });
      onDone();
    } catch (e) {
      onError(isConnectivityError(e) ? s.cashWalletOffline : strings.common.error);
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={s.cashWalletEditTitle}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="rounded-xl bg-paper-deep p-3 text-xs leading-relaxed text-ink-soft">
          {s.cashWalletEditHint}
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {s.cashWalletEditField.replace("{currency}", wallet.currency)}
          </span>
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={FIELD}
            dir="ltr"
          />
        </label>

        {value.trim() !== "" && !valid && <p className="text-sm text-alert">{s.cashWalletEditInvalid}</p>}

        <p className="text-xs text-ink-soft">
          <bdi>{s.cashWalletEditNow.replace("{left}", formatMoney(Math.round(wallet.left), wallet.currency))}</bdi>
        </p>

        <button
          type="submit"
          disabled={busy || !valid}
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {s.save}
        </button>
      </form>
    </Sheet>
  );
}
