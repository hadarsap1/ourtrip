"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CheckIcon,
  ChevronForwardIcon,
  DocumentIcon,
  GlobeIcon,
  PlaneIcon,
  UsersIcon,
  WarningIcon,
  type IconProps,
} from "@/components/icons";
import {
  buildReadiness,
  countOutstanding,
  daysUntil,
  loadReadiness,
  type ReadyGroup,
  type ReadyStatus,
} from "@/lib/data/readiness";
import { getActiveTrip } from "@/lib/data/trip";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";
import type { ComponentType } from "react";

// One screen that adds up what every other screen only knows about itself.
// Measured 2026-09-05, 59 days out: 227 itinerary days and zero items, zero
// bookings, zero documents. Each screen showed its own emptiness and none of
// them said "you are not ready".

const GROUP_ICON: Record<string, ComponentType<IconProps>> = {
  documents: DocumentIcon,
  start: PlaneIcon,
  trip: GlobeIcon,
  people: UsersIcon,
};

const STATUS_STYLE: Record<ReadyStatus, string> = {
  ok: "bg-sea-tint text-sea-deep",
  warn: "bg-sun-tint text-sun-deep",
  missing: "bg-alert-tint text-alert",
};

function fill(template: string, values?: Record<string, number | string>): string {
  if (!values) return template;
  return Object.entries(values).reduce(
    (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
    template
  );
}

export function ReadyScreen() {
  const s = strings.ready;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [groups, setGroups] = useState<ReadyGroup[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Fetches and computes without touching state, so the effect below has a
  // single place where it commits the result.
  const load = useCallback(async (): Promise<{
    trip: Trip | null;
    groups: ReadyGroup[];
  }> => {
    const activeTrip = await getActiveTrip();
    if (!activeTrip) return { trip: null, groups: [] };
    const input = await loadReadiness(
      activeTrip.id,
      activeTrip.start_date,
      activeTrip.end_date,
      todayISO()
    );
    return { trip: activeTrip, groups: buildReadiness(input) };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((result) => {
        if (cancelled) return;
        setTrip(result.trip);
        setGroups(result.groups);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const left = trip ? daysUntil(todayISO(), trip.start_date) : null;
  const outstanding = groups ? countOutstanding(groups) : 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-6 pb-8 sm:max-w-2xl">
      <header className="ot-postcard px-4 py-5">
        {/* The screen's heading, not decoration: /ready was the one route that
            mounted with no h1 at all, so nothing announced it on arrival. */}
        <h1 className="text-xs font-bold uppercase tracking-[0.08em] text-white/70">
          {s.title}
        </h1>
        <p className="mt-1 text-[26px] font-extrabold leading-tight">
          {left == null
            ? s.noDate
            : left > 0
              ? s.countdown.replace("{n}", String(left))
              : left === 0
                ? s.countdownToday
                : s.started}
        </p>
        {groups && groups.length > 0 && (
          <p className="mt-1 text-sm text-white/80">
            {outstanding === 0
              ? s.allDone
              : s.outstanding.replace("{n}", String(outstanding))}
          </p>
        )}
      </header>

      {failed ? (
        <p className="rounded-2xl bg-paper-deep p-4 text-center text-sm text-ink-soft">
          {strings.common.error}
        </p>
      ) : groups === null ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {strings.common.loading}
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl bg-paper-deep p-4 text-center text-sm text-ink-soft">
          {s.noTrip}
        </p>
      ) : (
        groups.map((group) => {
          const Icon = GROUP_ICON[group.key] ?? GlobeIcon;
          return (
            <section key={group.key}>
              <h2 className="mb-2 flex items-center gap-1.5 px-0.5 text-sm font-bold text-sea">
                <Icon className="h-4 w-4" strokeWidth={1.7} />
                {s.groups[group.key as keyof typeof s.groups]}
              </h2>
              <ul className="overflow-hidden rounded-[18px] border border-line bg-white">
                {group.checks.map((check, i) => {
                  const text = s.checks[check.key];
                  if (!text) return null;
                  const detail =
                    check.status === "ok"
                      ? (text.okDetail ?? fill(text.detail, check.values))
                      : fill(text.detail, check.values);
                  const row = (
                    <>
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${STATUS_STYLE[check.status]}`}
                        aria-hidden="true"
                      >
                        {check.status === "ok" ? (
                          <CheckIcon className="h-4 w-4" strokeWidth={2} />
                        ) : (
                          <WarningIcon className="h-4 w-4" strokeWidth={2} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold text-ink">
                          {text.label}
                        </span>
                        <span className="block text-[11.5px] text-ink-soft">
                          {detail}
                        </span>
                      </span>
                      {check.href && (
                        <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
                      )}
                    </>
                  );
                  return (
                    <li
                      key={check.key}
                      className={i > 0 ? "border-t border-line" : ""}
                    >
                      {check.href ? (
                        <Link
                          href={check.href}
                          className="flex items-center gap-3 px-3.5 py-3 active:bg-paper-deep"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          {row}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
