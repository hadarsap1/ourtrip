"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { acceptPlan, loadPlanCandidates } from "@/lib/data/placeOptions";
import { planAreas, planDay, swapStop, toTime, type PlanCandidate, type PlanStop } from "@/lib/planMyDay";
import { hhmm } from "@/lib/inTrip";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { ItineraryDay } from "@/lib/types";

const t = strings.planMyDay;
const catLabel = (c: string | null) => (c ? (strings.options.categories as Record<string, string>)[c] ?? c : "");

/**
 * Plan-my-day (2.2): proposes 3-4 stops for one empty day from the ideas bank,
 * rule-based (lib/planMyDay.ts), so it works offline. Accept all, swap one,
 * or ask for another proposal; accepting needs a connection.
 */
export function PlanMyDaySheet({
  tripId,
  day,
  startSortOrder,
  onClose,
  onDone,
}: {
  tripId: string;
  day: ItineraryDay | null;
  startSortOrder: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [options, setOptions] = useState<PlanCandidate[] | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [rainy, setRainy] = useState(false);
  const [seed, setSeed] = useState(0);
  // Swaps edit the proposal for the inputs they were made on; any change of
  // area, rain or seed starts from a fresh proposal.
  const [edited, setEdited] = useState<{ key: object; plan: PlanStop[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    let alive = true;
    void loadPlanCandidates(tripId).then((o) => {
      if (alive) setOptions(o);
    });
    return () => {
      alive = false;
    };
  }, [tripId, day]);

  const areas = useMemo(
    () => (options && day ? planAreas(options, day.country_code, day.location_name) : []),
    [options, day]
  );
  const chosenArea = area ?? areas[0]?.area ?? null;
  const input = useMemo(
    () => ({ options: options ?? [], countryCode: day?.country_code ?? null, area: chosenArea, rainy, seed }),
    [options, day, chosenArea, rainy, seed]
  );

  const proposal = useMemo(() => (options ? planDay(input) : []), [input, options]);
  const plan = edited && edited.key === input ? edited.plan : proposal;

  async function accept() {
    if (!day || plan.length === 0 || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const n = await acceptPlan(
        plan.map((s) => ({ option: s.option, start: toTime(s.start) })),
        day.id,
        startSortOrder
      );
      onDone(t.added.replace("{n}", String(n)));
    } catch {
      setNote(t.needsOnline);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={day !== null} onClose={onClose} title={day ? t.title.replace("{date}", formatDate(day.date)) : ""}>
      {options === null ? (
        <p className="py-6 text-center text-sm text-ink-soft" role="status">{t.loading}</p>
      ) : (
        <div className="space-y-3">
          {areas.length > 1 && (
            <div role="radiogroup" aria-label={t.areaLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {areas.map((a) => (
                <button
                  key={a.area}
                  type="button"
                  role="radio"
                  aria-checked={a.area === chosenArea}
                  onClick={() => {
                    setArea(a.area);
                    setSeed(0);
                  }}
                  className={`shrink-0 rounded-full px-3.5 text-sm font-semibold ${a.area === chosenArea ? "bg-sea text-on-sea" : "border border-line bg-surface text-ink"}`}
                >
                  {a.area} <span className="opacity-70">({a.count})</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={rainy}
            onClick={() => setRainy((r) => !r)}
            className={`flex w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold ${rainy ? "border-info bg-info-soft text-ink" : "border-line bg-surface text-ink"}`}
          >
            {t.rainy}
            <span aria-hidden="true" className={`h-6 w-10 rounded-full p-0.5 transition-colors ${rainy ? "bg-info" : "bg-line"}`}>
              <span className={`block h-5 w-5 rounded-full bg-surface shadow transition-transform ${rainy ? "-translate-x-4" : ""}`} />
            </span>
          </button>

          {plan.length === 0 ? (
            <p className="rounded-xl bg-paper-deep px-3 py-4 text-center text-sm text-ink-soft">{t.empty}</p>
          ) : (
            <ol className="space-y-1">
              {plan.map((s, i) => (
                <li key={s.option.id}>
                  {i > 0 && (
                    <p className="flex justify-center py-0.5 text-[12px] text-ink-soft">
                      <span className="rounded-full bg-paper-deep px-2 py-0.5" title={t.estimate}>
                        {s.travelFromPrev !== null ? t.travel.replace("{n}", String(s.travelFromPrev)) : "…"}
                      </span>
                    </p>
                  )}
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                    <bdi className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-sea">{hhmm(s.start)}</bdi>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{s.option.title}</span>
                      <span className="block text-[12px] text-ink-soft">{catLabel(s.option.category)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEdited({ key: input, plan: swapStop(plan, i, input) })}
                      aria-label={t.swapLabel.replace("{title}", s.option.title)}
                      className="shrink-0 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink"
                    >
                      {t.swap}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="text-[12px] text-ink-soft">{t.hint}</p>
          {note && <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">{note}</p>}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => void accept()}
              disabled={saving || plan.length === 0}
              className="rounded-xl bg-sea py-3 text-base font-bold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft"
            >
              {t.accept}
            </button>
            <button
              type="button"
              onClick={() => setSeed((n) => n + 1)}
              disabled={plan.length === 0}
              className="rounded-xl border border-line bg-surface py-3 text-base font-bold text-ink disabled:opacity-50"
            >
              {t.regenerate}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
