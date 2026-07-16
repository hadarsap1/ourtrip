// Daily FX fetch into fx_rates (DECISIONS #7 provider order):
// open.er-api.com (global, ~160 currencies) → Frankfurter (ECB) fallback.
// Writes with the service role — fx_rates has no client write policy.
// Deployed with verify_jwt=false so pg_cron can invoke it without a key:
// the function is idempotent (upserts today's public rates) and harmless
// to over-invoke, so anonymous invocation is an accepted risk
// (logged in docs/SECURITY-CHECKS.md).

import { createClient } from "npm:@supabase/supabase-js@2";

type Rates = Record<string, number>;

async function fetchRates(): Promise<{ rates: Rates; source: string } | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/ILS");
    if (res.ok) {
      const json = await res.json();
      if (json?.result === "success" && json?.rates) {
        return { rates: json.rates as Rates, source: "open.er-api.com" };
      }
    }
  } catch (_) {
    // fall through to Frankfurter
  }
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=ILS");
    if (res.ok) {
      const json = await res.json();
      if (json?.rates) return { rates: json.rates as Rates, source: "frankfurter" };
    }
  } catch (_) {
    // both providers failed
  }
  return null;
}

Deno.serve(async () => {
  const fetched = await fetchRates();
  if (!fetched) {
    // fx_rates keeps yesterday's rows — clients fall back to last known rate
    return new Response(
      JSON.stringify({ ok: false, error: "all FX providers failed" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const day = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(fetched.rates)
    .filter(([currency, perIls]) =>
      currency !== "ILS" && typeof perIls === "number" && perIls > 0
    )
    .map(([currency, perIls]) => ({
      day,
      currency,
      // provider returns units-per-ILS; schema stores ILS-per-unit, 6dp
      rate_to_ils: Math.round((1 / perIls) * 1e6) / 1e6,
    }))
    .filter((row) => row.rate_to_ils > 0);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error } = await supabase.from("fx_rates").upsert(rows);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, day, count: rows.length, source: fetched.source }),
    { headers: { "content-type": "application/json" } }
  );
});
