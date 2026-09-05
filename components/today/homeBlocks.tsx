"use client";

import Link from "next/link";
import { CheckIcon, ChevronForwardIcon } from "@/components/icons";
import type {
  BudgetSummary,
  ChecklistPreview,
  TimelineStretch,
} from "@/lib/data/homeDashboard";
import { formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";

// The three blocks of the pre-departure home screen, as presentational
// components taking exactly the data they draw. Split out of CountdownHome so
// each can be looked at on its own with made-up numbers - the screen itself
// needs a real session and a real trip before it will render anything.

/** What still has to be booked, ticked without leaving the home screen. */
export function ChecklistBlock({
  checklist,
  onTick,
}: {
  checklist: ChecklistPreview;
  onTick: (itemId: string) => void;
}) {
  const s = strings.home;
  return (
    <section className="overflow-hidden rounded-[18px] border border-line bg-white">
      <div className="flex items-baseline gap-2 border-b border-line px-3.5 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
          {checklist.title}
        </h2>
        <span className="shrink-0 text-[11.5px] font-semibold text-ink-soft">
          {s.checklistProgress
            .replace("{done}", String(checklist.done))
            .replace("{total}", String(checklist.total))}
        </span>
      </div>

      {checklist.open.length === 0 ? (
        <p className="px-3.5 py-3 text-center text-[13px] font-semibold text-sea">
          {s.checklistAllDone}
        </p>
      ) : (
        <ul>
          {checklist.open.map((item, i) => (
            <li key={item.id} className={i > 0 ? "border-t border-line" : ""}>
              {/* Ticking here rather than only on /checklists: the whole point
                  of surfacing these is that they can be dealt with. */}
              <button
                type="button"
                onClick={() => onTick(item.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-start active:bg-paper-deep"
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-line bg-white"
                  aria-hidden="true"
                >
                  <CheckIcon className="h-3.5 w-3.5 text-line" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/checklists"
        className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 active:bg-paper-deep"
      >
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-sea">
          {s.checklistMore}
        </span>
        <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
      </Link>
    </section>
  );
}

/** Planned against target, with what is spent so far and what is unallocated. */
export function BudgetBlock({ budget }: { budget: BudgetSummary }) {
  const s = strings.home;
  const pct =
    budget.budgetForProgress > 0
      ? Math.min(100, (budget.planned / budget.budgetForProgress) * 100)
      : 0;
  return (
    <Link
      href="/budget"
      className="block rounded-[18px] border border-line bg-white p-3.5 active:bg-paper-deep"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="min-w-0 flex-1 text-[13.5px] font-bold text-ink">
          {s.budgetTitle}
        </h2>
        <span className="shrink-0 text-[11.5px] text-ink-soft">
          {s.budgetSpent} {formatMoney(budget.spent, "ILS")}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-extrabold text-ink">
          {formatMoney(budget.planned, "ILS")}
        </span>
        {budget.hasTarget && (
          <span className="text-[12px] text-ink-soft">
            / {formatMoney(budget.target ?? 0, "ILS")} {s.budgetTarget}
          </span>
        )}
      </div>

      {budget.hasTarget ? (
        <>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep"
            role="presentation"
          >
            <div
              className={`h-full rounded-full ${
                budget.overTarget ? "bg-alert" : "bg-sea"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className={`mt-1.5 text-[11.5px] ${
              budget.overTarget ? "font-semibold text-alert" : "text-ink-soft"
            }`}
          >
            {budget.gap === 0
              ? s.budgetExact
              : budget.overTarget
                ? s.budgetOver.replace(
                    "{amount}",
                    formatMoney(Math.abs(budget.gap), "ILS")
                  )
                : s.budgetUnallocated.replace(
                    "{amount}",
                    formatMoney(budget.gap, "ILS")
                  )}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[11.5px] text-ink-soft">{s.budgetNone}</p>
      )}
    </Link>
  );
}

/** The 14 stretches of the trip as a scrollable strip. */
export function TimelineBlock({ timeline }: { timeline: TimelineStretch[] }) {
  const s = strings.home;
  return (
    <section>
      <p className="ot-kicker mb-2 px-0.5">{s.timelineTitle}</p>
      {/* items-stretch so a highlighted card's extra label line does not leave
          its neighbours short. */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {timeline.map((stretch) => (
          <StretchCard
            key={`${stretch.countryCode}::${stretch.locationName}`}
            stretch={stretch}
          />
        ))}
      </div>
    </section>
  );
}

function StretchCard({ stretch }: { stretch: TimelineStretch }) {
  const s = strings.home;
  const highlighted = stretch.isCurrent || stretch.isNext;
  return (
    <div
      className={`flex w-[136px] shrink-0 flex-col rounded-[16px] border p-3 ${
        highlighted ? "border-sea bg-sea-tint/40" : "border-line bg-white"
      }`}
    >
      {/* The label line is always present, empty when the stretch is neither
          current nor next, so every card in the strip lines up. */}
      <p className="mb-1 h-[13px] text-[10.5px] font-bold text-sea">
        {highlighted
          ? stretch.isCurrent
            ? s.timelineCurrent
            : s.timelineNext
          : ""}
      </p>
      {/* Two lines, because one stretch is called "המקטע האחרון - פתוח
          (גאורגיה כברירת מחדל)" and a single truncated line of that says
          nothing at all. */}
      <p className="line-clamp-2 min-h-[2.4em] text-[13px] font-bold leading-[1.2] text-ink">
        {stretch.locationName}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-soft">
        {s.timelineDays.replace("{n}", String(stretch.days))}
      </p>
      <p
        className={`mt-auto pt-1.5 text-[10.5px] ${
          stretch.daysWithItems === 0 ? "text-ink-faint" : "text-sea"
        }`}
      >
        {stretch.daysWithItems === 0
          ? s.timelineNothingPlanned
          : s.timelinePlanned
              .replace("{planned}", String(stretch.daysWithItems))
              .replace("{n}", String(stretch.days))}
      </p>
    </div>
  );
}
