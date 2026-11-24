import { strings } from "@/lib/strings";

export type QuickPayment = "regular" | "cash" | "withdrawal";

/**
 * Regular / paid in cash / ATM withdrawal, as one row of chips, for the two
 * quick adds (Hadar 24/11/2026). The full expense form has its own picker.
 */
export function PaymentPicker({ value, onChange }: { value: QuickPayment; onChange: (v: QuickPayment) => void }) {
  const b = strings.budget;
  const options: { value: QuickPayment; label: string }[] = [
    { value: "regular", label: b.paymentRegular },
    { value: "cash", label: b.paymentCash },
    { value: "withdrawal", label: b.paymentWithdrawalShort },
  ];
  return (
    <div role="radiogroup" aria-label={b.payment} className="flex flex-wrap justify-center gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${
            o.value === value ? "border-[1.5px] border-green bg-green-soft text-green" : "border border-line bg-surface text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
