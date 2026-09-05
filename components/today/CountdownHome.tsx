"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronForwardIcon,
  CoinIcon,
  WarningIcon,
} from "@/components/icons";
import {
  BudgetBlock,
  ChecklistBlock,
  TimelineBlock,
} from "./homeBlocks";
import { setItemChecked } from "@/lib/data/checklists";
import { loadHomeSummary, type HomeSummary } from "@/lib/data/homeDashboard";
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
// The trip starts 03.11.2026, so there is no itinerary day for "today" and the
// Today dashboard had nothing to show - for 59 days running. The first version
// of this screen replaced that with a countdown and a list of what was missing,
// which was better but still one-sided: it showed only failures, while 553
// collected places, a 24-item bookings checklist and a ₪155,377 budget sat
// invisible one tap away.
//
// It now leads with what exists and what can be acted on - the next things to
// book, where the money stands, the shape of the trip - and keeps only the TWO
// most urgent warnings. Four warnings under three new blocks is a wall, and a
// wall gets ignored the same way an empty card does.
const HOW_MANY_WARNINGS = 2;

export function CountdownHome({ trip }: { trip: Trip }) {
  const r = strings.ready;
  const [checks, setChecks] = useState<ReadyCheck[] | null>(null);
  const [outstanding, setOutstanding] = useState(0);
  const [summary, setSummary] = useState<HomeSummary | null>(null);

  const loadSummary = useCallback(async () => {
    const next = await loadHomeSummary(trip.id, todayISO()).catch(() => null);
    if (next) setSummary(next);
  }, [trip.id]);

  useEffect(() => {
    let cancelled = false;

    void loadReadiness(trip.id, trip.start_date, trip.end_date, todayISO())
      .then((input) => {
        if (cancelled) return;
        const groups = buildReadiness(input);
        setChecks(urgentChecks(groups, HOW_MANY_WARNINGS));
        setOutstanding(countOutstanding(groups));
      })
      .catch(() => {
        // The countdown and the expense shortcut still work with no network.
        if (!cancelled) setChecks([]);
      });

    void loadHomeSummary(trip.id, todayISO())
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [trip]);

  async function tick(itemId: string) {
    // Optimistic: the row leaves the list at once, then the reload confirms it
    // and pulls up the next open item behind it.
    setSummary((prev) =>
      prev?.checklist
        ? {
            ...prev,
            checklist: {
              ...prev.checklist,
              done: prev.checklist.done + 1,
              open: prev.checklist.open.filter((i) => i.id !== itemId),
            },
          }
        : prev
    );
    await setItemChecked(itemId, true).catch(() => {});
    await loadSummary();
  }

  const left = daysUntil(todayISO(), trip.start_date);
  const budget = summary?.budget ?? null;
  const checklist = summary?.checklist ?? null;
  const timeline = summary?.timeline ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8 sm:max-w-2xl">
      <header className="ot-postcard px-4 py-6">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/70">
          {trip.name}
        </p>
        <p className="mt-1 text-[32px] font-extrabold leading-none">
          {left == null
            ? r.noDate
            : left === 0
              ? r.countdownToday
              : r.countdown.replace("{n}", String(left))}
        </p>
        {checks !== null && (
          <p className="mt-2 text-sm text-white/80">
            {outstanding === 0
              ? r.allDone
              : r.outstanding.replace("{n}", String(outstanding))}
          </p>
        )}
      </header>

      {/* ---- what still has to be booked ---- */}
      {checklist && checklist.total > 0 && (
        <ChecklistBlock checklist={checklist} onTick={(id) => void tick(id)} />
      )}

      {/* ---- where the money stands ---- */}
      {budget && <BudgetBlock budget={budget} />}

      {/* ---- the shape of the trip ---- */}
      {timeline.length > 0 && <TimelineBlock timeline={timeline} />}

      {/* ---- the two most urgent gaps ---- */}
      {checks !== null && checks.length > 0 && (
        <section>
          <p className="ot-kicker mb-2 px-0.5">{r.nextUp}</p>
          <ul className="overflow-hidden rounded-[18px] border border-line bg-white">
            {checks.map((check, i) => {
              const text = r.checks[check.key];
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
          {r.seeAll}
        </span>
        <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
      </Link>

      <Link
        href="/budget"
        className="flex items-center justify-center gap-2 rounded-2xl bg-sea py-3 text-sm font-bold text-white"
      >
        <CoinIcon className="h-4 w-4" strokeWidth={1.9} />
        {strings.today.addExpenseShort}
      </Link>
    </div>
  );
}
