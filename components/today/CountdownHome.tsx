"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronForwardIcon,
  CoinIcon,
  WarningIcon,
} from "@/components/icons";
import {
  buildReadiness,
  countOutstanding,
  daysUntil,
  loadReadiness,
  urgentChecks,
  type ReadyCheck,
} from "@/lib/data/readiness";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";

// The home screen between now and departure.
//
// The trip starts 03.11.2026. Until then there is no itinerary day for "today",
// so the Today dashboard had nothing to show and every open of the app landed
// on an empty card — for 59 days running. This replaces it with the only
// question that matters in that window: what still has to happen before we fly.
//
// It deliberately shows a FEW rows rather than the full checklist. /ready has
// all twelve; a home screen that lists twelve open items is a wall, and a wall
// gets ignored the same way an empty card does.
const HOW_MANY = 4;

export function CountdownHome({ trip }: { trip: Trip }) {
  const s = strings.ready;
  const [checks, setChecks] = useState<ReadyCheck[] | null>(null);
  const [outstanding, setOutstanding] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadReadiness(trip.id, trip.start_date, trip.end_date, todayISO())
      .then((input) => {
        if (cancelled) return;
        const groups = buildReadiness(input);
        setChecks(urgentChecks(groups, HOW_MANY));
        setOutstanding(countOutstanding(groups));
      })
      .catch(() => {
        // The countdown and the quick actions still work with no network.
        if (!cancelled) setChecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trip]);

  const left = daysUntil(todayISO(), trip.start_date);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8 sm:max-w-2xl">
      <header className="ot-postcard px-4 py-6">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/70">
          {trip.name}
        </p>
        <p className="mt-1 text-[32px] font-extrabold leading-none">
          {left == null
            ? s.noDate
            : left === 0
              ? s.countdownToday
              : s.countdown.replace("{n}", String(left))}
        </p>
        {checks !== null && (
          <p className="mt-2 text-sm text-white/80">
            {outstanding === 0
              ? s.allDone
              : s.outstanding.replace("{n}", String(outstanding))}
          </p>
        )}
      </header>

      {/* Only the expense shortcut. There was a second button here pointing at
          the itinerary, but the bottom bar already has that tab - a shortcut to
          somewhere one tap away is just a smaller version of the same link,
          taking space from the checklist underneath. */}
      <Link
        href="/budget"
        className="flex items-center justify-center gap-2 rounded-2xl bg-sea py-3 text-sm font-bold text-white"
      >
        <CoinIcon className="h-4 w-4" strokeWidth={1.9} />
        {strings.today.addExpenseShort}
      </Link>

      {checks === null ? (
        <p className="py-4 text-center text-sm text-ink-soft">
          {strings.common.loading}
        </p>
      ) : checks.length === 0 ? (
        <p className="ot-card p-4 text-center text-sm text-ink-soft">
          {s.allDone}
        </p>
      ) : (
        <section>
          <p className="ot-kicker mb-2 px-0.5">{s.nextUp}</p>
          <ul className="overflow-hidden rounded-[18px] border border-line bg-white">
            {checks.map((check, i) => {
              const text = s.checks[check.key];
              if (!text) return null;
              return (
                <li key={check.key} className={i > 0 ? "border-t border-line" : ""}>
                  <Link
                    href={check.href ?? "/ready"}
                    className="flex items-center gap-3 px-3.5 py-3 active:bg-paper-deep"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        check.status === "missing"
                          ? "bg-alert-tint text-alert"
                          : "bg-sun-tint text-sun-deep"
                      }`}
                      aria-hidden="true"
                    >
                      <WarningIcon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-ink">
                        {text.label}
                      </span>
                      <span className="block text-[11.5px] text-ink-soft">
                        {Object.entries(check.values ?? {}).reduce(
                          (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
                          text.detail
                        )}
                      </span>
                    </span>
                    <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link
        href="/ready"
        className="flex items-center gap-2.5 rounded-[18px] border border-line bg-white px-3.5 py-3 active:bg-paper-deep"
      >
        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-ink">
          {s.seeAll}
        </span>
        <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
      </Link>
    </div>
  );
}
