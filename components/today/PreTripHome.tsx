"use client";

import Link from "next/link";
import { IosInstallHint } from "./IosInstallHint";
import { ChevronForwardIcon, DocumentIcon, PhrasebookIcon, PinIcon, WarningIcon } from "@/components/icons";
import { Ring, ProgressBar } from "@/components/ui/Progress";
import { CountdownChip } from "@/components/ui/Chip";
import { ChecklistBlock } from "./homeBlocks";
import { daysUntil, type ReadyCheck } from "@/lib/data/readiness";
import { splitDestinationLabel } from "@/lib/data/facts";
import type { HomeSummary, TimelineStretch } from "@/lib/data/homeDashboard";
import { resolveBudgetProgress } from "@/lib/budget";
import { todayAllowance } from "@/lib/todayBudget";
import { flagEmoji } from "@/lib/countries";
import { formatDate, formatMoney, formatShortDate, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";

// Literal classes so Tailwind keeps them (country photo-slot fallbacks).
const COUNTRY_FILL: Record<string, string> = {
  VN: "bg-vn", KH: "bg-kh", LA: "bg-la", TH: "bg-th", PH: "bg-ph", JP: "bg-jp", GE: "bg-ge",
};
const COUNTRY_BAR: Record<string, string> = COUNTRY_FILL;

/**
 * Today before departure (1.6, design board "Today · pre-trip"): photo-slot
 * hero with the countdown and the readiness ring, the budget with today's
 * share, the trip's stretches as a carousel, what is most urgent, and the
 * offline-critical quick actions. Same data as CountdownHome.
 */
export function PreTripHome({
  trip,
  checks,
  outstanding,
  summary,
  onTick,
}: {
  trip: Trip;
  checks: ReadyCheck[] | null;
  outstanding: number;
  summary: HomeSummary | null;
  onTick: (itemId: string) => void;
}) {
  const r = strings.ready;
  const t = strings.todayV2;
  const today = todayISO();
  const left = daysUntil(today, trip.start_date);
  const first = summary?.timeline[0] ?? null;
  const fill = (first && COUNTRY_FILL[first.countryCode]) || "bg-sea";

  const budget = summary?.budget ?? null;
  const progress = budget ? resolveBudgetProgress(budget, budget.spent) : null;
  const allowance =
    budget && progress
      ? todayAllowance({ remaining: progress.remaining, spentToday: budget.spentToday ?? 0, today, start: trip.start_date, end: trip.end_date })
      : null;
  const money = (n: number) => formatMoney(Math.round(n), "ILS");

  // Readiness ring: share of checks done is unknown here, so the ring shows
  // "how close to nothing open" against a soft scale of 10.
  const readyPct = outstanding === 0 ? 100 : Math.max(8, 100 - outstanding * 10);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pt-4 pb-8 sm:max-w-2xl">
      <IosInstallHint />
      {/* Hero: photo slot of the first country (gradient + flag until a photo exists). */}
      <section aria-label={t.countdownLabel}>
        <div className={`relative h-[200px] overflow-hidden rounded-3xl ${fill}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-black/35" />
          {first && (
            <span className="absolute start-4 top-4 flex h-8 items-center gap-1.5 rounded-full bg-black/35 pe-3 ps-2 text-sm font-semibold text-white">
              <span aria-hidden="true">{flagEmoji(first.countryCode)}</span>
              {t.firstStop.replace("{place}", splitDestinationLabel(first.countryCode, first.locationName).country)}
            </span>
          )}
        </div>
        <div className="relative mx-4 -mt-14 flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-[var(--e2)]">
          <div className="min-w-0">
            <p className="ot-kicker">{trip.name}</p>
            <p className="flex items-baseline gap-2">
              <span className="text-[40px] font-extrabold leading-[44px] tabular-nums text-ink">
                <bdi>{left ?? "-"}</bdi>
              </span>
              <span className="text-xl font-bold text-ink">{left === 0 ? r.countdownToday : t.daysToGo}</span>
            </p>
            {trip.start_date && (
              <p className="text-xs text-ink-soft">{t.departs.replace("{date}", formatDate(trip.start_date))}</p>
            )}
          </div>
          <Link href="/ready" className="flex min-w-[88px] flex-col items-center gap-1 text-center">
            <Ring value={readyPct} size={64} stroke={7} label={r.outstanding.replace("{n}", String(outstanding))}>
              <span className="text-xl font-extrabold tabular-nums text-ink">
                <bdi>{checks === null ? "…" : outstanding}</bdi>
              </span>
            </Ring>
            <span className="text-xs font-semibold text-sea">{outstanding === 0 ? r.allDone : t.openItems}</span>
          </Link>
        </div>
      </section>

      {/* Budget with today's share. */}
      {budget && progress && (
        <Link href="/budget" className="block rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="ot-kicker">{strings.nav.budget}</p>
          <div className="mt-1 flex items-center gap-4">
            <Ring value={Math.max(0, 100 - progress.usedPct)} size={88} stroke={8} colorVar={progress.overSpent ? "var(--danger)" : "var(--brand)"} trackVar="var(--brand-soft)">
              <span className="text-base font-extrabold tabular-nums text-ink">
                <bdi>{Math.max(0, 100 - progress.usedPct)}%</bdi>
              </span>
              <span className="text-xs text-ink-soft">{t.left}</span>
            </Ring>
            <div className="min-w-0">
              {allowance ? (
                <>
                  <p className="text-sm text-ink-soft">{t.leftToday}</p>
                  <p className={`text-[40px] font-extrabold leading-[44px] tabular-nums ${allowance.leftToday < 0 ? "text-alert" : "text-ink"}`}>
                    <bdi>{money(allowance.leftToday)}</bdi>
                  </p>
                  <p className="text-xs text-ink-soft">{t.dailyShare.replace("{amount}", money(allowance.dailyShare))}</p>
                </>
              ) : (
                <p className="text-xl font-extrabold text-ink">
                  <bdi>{money(progress.remaining)}</bdi>
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <p className="flex flex-col">
              <span className="text-xs text-ink-soft">{strings.budget.kpiSpent}</span>
              <span className="text-base font-bold tabular-nums text-ink"><bdi>{money(progress.spent)}</bdi></span>
            </p>
            <p className="flex flex-col">
              <span className="text-xs text-ink-soft">{t.leftWholeTrip}</span>
              <span className="text-base font-bold tabular-nums text-ink"><bdi>{money(progress.remaining)}</bdi></span>
            </p>
          </div>
        </Link>
      )}

      {/* Stretches as a carousel with flag circles and countdown chips. */}
      {summary && summary.timeline.length > 0 && (
        <section aria-labelledby="segs-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="segs-h" className="text-xl font-bold text-ink">{t.segmentsTitle}</h2>
            <Link href="/itinerary" className="flex items-center gap-0.5 text-sm font-semibold text-sea">
              {t.fullRoute}
              <ChevronForwardIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {summary.timeline.map((s) => (
              <SegmentCard key={`${s.countryCode}::${s.locationName}::${s.from}`} stretch={s} today={today} />
            ))}
          </div>
        </section>
      )}

      {/* Most urgent. */}
      {checks !== null && checks.length > 0 && (
        <section aria-labelledby="urgent-h">
          <h2 id="urgent-h" className="mb-2 text-xl font-bold text-ink">{t.urgentTitle}</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {checks.map((check, i) => {
              const text = r.checks[check.key];
              if (!text) return null;
              return (
                <li key={check.key} className={i > 0 ? "border-t border-line" : ""}>
                  <Link href={check.href ?? "/ready"} className="flex min-h-[64px] items-center gap-3 px-4 py-2 active:bg-paper-deep">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${check.status === "missing" ? "bg-alert-tint text-alert" : "bg-sun-tint text-sun-deep"}`} aria-hidden="true">
                      <WarningIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{text.label}</span>
                      <span className={`block text-xs ${check.status === "missing" ? "text-alert" : "text-ink-soft"}`}>
                        {Object.entries(check.values ?? {}).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text.detail)}
                      </span>
                    </span>
                    <ChevronForwardIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {summary?.checklist && summary.checklist.total > 0 && <ChecklistBlock checklist={summary.checklist} onTick={onTick} />}

      {/* Offline-critical shortcuts. */}
      <nav aria-label={t.quickActions} className="grid grid-cols-4 gap-2">
        <QuickAction href="/documents" label={strings.nav.documents} tone="bg-sea-tint text-sea" icon={<DocumentIcon className="h-6 w-6" />} />
        <QuickAction href="/emergency" label="SOS" tone="bg-alert-tint text-alert" icon={<WarningIcon className="h-6 w-6" />} />
        <QuickAction href="/phrasebook" label={strings.more.menuPhrasebook} tone="bg-cat-flight/10 text-cat-flight" icon={<PhrasebookIcon className="h-6 w-6" />} />
        <QuickAction href="/recommend" label={strings.more.menuRecommend} tone="bg-cat-activity/10 text-cat-activity" icon={<PinIcon className="h-6 w-6" />} />
      </nav>
    </div>
  );
}

function SegmentCard({ stretch, today }: { stretch: TimelineStretch; today: string }) {
  const { country, area } = splitDestinationLabel(stretch.countryCode, stretch.locationName);
  const until = daysUntil(today, stretch.from);
  const fill = COUNTRY_FILL[stretch.countryCode] ?? "bg-sea";
  return (
    <article className={`flex w-[248px] shrink-0 flex-col gap-3 rounded-2xl border bg-surface p-4 ${stretch.isCurrent || stretch.isNext ? "border-sea" : "border-line"}`}>
      <div className="flex items-center gap-3">
        <span className="relative h-14 w-14 shrink-0">
          <span className={`block h-14 w-14 rounded-full ${fill}`}>
            <span className="block h-full w-full rounded-full bg-gradient-to-b from-white/20 to-black/30" />
          </span>
          <span aria-hidden="true" className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface text-sm">
            {flagEmoji(stretch.countryCode)}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-ink">{area ?? country}</span>
          <span className="block text-xs text-ink-soft">
            {area ? `${country} · ` : ""}
            <bdi>{stretch.countryCode}</bdi>
          </span>
          <span className="block text-xs text-ink-soft" dir="ltr">
            {formatShortDate(stretch.from)} - {formatShortDate(stretch.to)}
          </span>
        </span>
      </div>
      {stretch.isCurrent ? (
        <span className="self-start rounded-full bg-sea px-2 text-xs font-bold leading-6 text-on-sea">{strings.home.timelineCurrent}</span>
      ) : until !== null && until > 0 ? (
        <span className="self-start">
          <CountdownChip days={until} />
        </span>
      ) : null}
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-ink-soft">{strings.todayV2.nightsPlanned}</span>
          <b className="tabular-nums text-ink"><bdi>{stretch.daysWithItems}/{stretch.days}</bdi></b>
        </div>
        <ProgressBar value={stretch.daysWithItems} max={stretch.days} colorClass={COUNTRY_BAR[stretch.countryCode] ?? "bg-sea"} label={strings.todayV2.nightsPlanned} />
      </div>
    </article>
  );
}

function QuickAction({ href, label, icon, tone }: { href: string; label: string; icon: React.ReactNode; tone: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-3 text-center">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <span className="text-xs font-semibold text-ink">{label}</span>
    </Link>
  );
}
