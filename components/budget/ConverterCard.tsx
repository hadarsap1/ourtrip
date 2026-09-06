"use client";

import { useEffect, useState } from "react";
import { CURRENCIES } from "@/lib/currencies";
import { getRateToIls } from "@/lib/data/expenses";
import { formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";

// Quick converter + live daily rate line (SPEC 2.4).
export function ConverterCard() {
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("USD");
  const [toIls, setToIls] = useState(true); // true: currency → ILS
  // loading state is derived: rateInfo lags behind currency until fetched
  const [rateInfo, setRateInfo] = useState<{
    currency: string;
    rate: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRateToIls(currency).then((rate) => {
      if (!cancelled) setRateInfo({ currency, rate });
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const rateLoaded = rateInfo?.currency === currency;
  const rate = rateLoaded ? rateInfo.rate : null;

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 0 && rate !== null;
  const converted = !valid
    ? null
    : toIls
      ? value * (rate as number)
      : value / (rate as number);

  return (
    <section className="rounded-[18px] border border-line bg-white p-3.5">
      <h2 className="mb-3 text-xs font-bold text-ink">
        {strings.budget.converterTitle}
      </h2>
      <div className="flex items-center gap-2" dir="ltr">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={strings.budget.amount}
          className="w-28 rounded-xl border border-line px-3 py-2 text-base font-semibold focus:border-sea focus:outline-none"
        />
        <span className="text-sm font-semibold text-ink-soft">
          {toIls ? currency : "ILS"}
        </span>
        <button
          type="button"
          onClick={() => setToIls((v) => !v)}
          aria-label={strings.budget.converterTitle}
          className="grid h-11 w-11 place-items-center rounded-full bg-paper-deep text-ink-soft hover:bg-line"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-end text-lg font-bold text-sea">
          {converted === null
            ? "-"
            : formatMoney(
                Math.round(converted * 100) / 100,
                toIls ? "ILS" : currency
              )}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label={strings.budget.currency}
          className="min-h-[40px] rounded-xl border border-line px-2 py-1.5 text-sm focus:border-sea focus:outline-none"
          dir="ltr"
        >
          {CURRENCIES.filter((c) => c !== "ILS").map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-soft" dir="ltr">
          {!rateLoaded
            ? "…"
            : rate === null
              ? strings.budget.converterNoRate
              : `1 ${currency} = ${formatMoney(Math.round(rate * 10000) / 10000, "ILS")}`}
        </span>
        {rateLoaded && rate !== null && (
          <span className="text-xs text-ink-soft">
            · {strings.budget.converterRateLine}
          </span>
        )}
      </div>
    </section>
  );
}
