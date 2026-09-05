// Currencies offered in pickers, ordered by expected trip relevance.
// Any of the ~165 currencies in fx_rates converts fine - this is only the UI
// shortlist (multi-country trip: CLAUDE.md hard rule #9, no single-destination
// assumptions).
export const CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "THB",
  "VND", "KRW", "SGD", "AUD", "NZD", "INR",
] as const;

/**
 * Country → the currency you actually hand over there. Used to default the
 * expense sheet to the local currency, so entering a coffee in Lisbon doesn't
 * start by correcting the currency from ILS.
 *
 * Deliberately partial: it covers the countries on this trip's shortlist plus
 * the common ones around them. An unmapped country falls back to the last
 * currency used, and every one of the ~165 currencies in fx_rates still
 * converts - this only picks the default.
 */
export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IL: "ILS",
  US: "USD", EC: "USD", PA: "USD", SV: "USD",
  PT: "EUR", ES: "EUR", FR: "EUR", IT: "EUR", DE: "EUR", NL: "EUR",
  BE: "EUR", AT: "EUR", GR: "EUR", IE: "EUR", FI: "EUR", SK: "EUR",
  SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", CY: "EUR", MT: "EUR",
  LU: "EUR", HR: "EUR", ME: "EUR",
  GB: "GBP",
  CH: "CHF",
  JP: "JPY",
  CN: "CNY",
  TH: "THB",
  VN: "VND",
  KR: "KRW",
  SG: "SGD",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
};

/** The local currency for a country code, or null when we don't know it. */
export function currencyForCountry(
  code: string | null | undefined
): string | null {
  if (!code) return null;
  return CURRENCY_BY_COUNTRY[code.toUpperCase()] ?? null;
}
