// Currencies offered in pickers, ordered by expected trip relevance.
// Any of the ~165 currencies in fx_rates converts fine — this is only the UI
// shortlist (multi-country trip: CLAUDE.md hard rule #9, no single-destination
// assumptions).
export const CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "THB",
  "VND", "KRW", "SGD", "AUD", "NZD", "INR",
] as const;
