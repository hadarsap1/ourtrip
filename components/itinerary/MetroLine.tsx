"use client";

import { useEffect, useRef } from "react";
import { flagEmoji } from "@/lib/countries";
import { formatShortDate } from "@/lib/format";
import { focusIndex, metroStops, type MetroLeg } from "@/lib/metroLine";
import { strings } from "@/lib/strings";

const t = strings.metro;

/**
 * Trip overview (2.5): the trip as a metro line, scrolling sideways in reading
 * order (right to left). One station per stay; the track takes the colour of
 * the country it runs into; a flag marks each country "interchange"; the
 * current stay is the big station and is scrolled into view first. Tapping a
 * station opens that stay in the list.
 */
export function MetroLine({ legs, onOpen }: { legs: MetroLeg[]; onOpen: (key: string) => void }) {
  const stops = metroStops(legs);
  const focus = focusIndex(legs);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    refs.current[focus]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [focus, legs.length]);

  if (stops.length === 0) return null;

  return (
    <nav aria-label={t.label} className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-max px-1">
        {stops.map((s, i) => {
          const current = s.phase === "current";
          const dates = `${formatShortDate(s.from)}-${formatShortDate(s.to)}`;
          return (
            <li key={s.key} className="relative w-[92px] shrink-0">
              {/* track to the next station (towards the end of the line = inline-end) */}
              {s.trackOut && (
                <span aria-hidden="true" className="absolute top-[30px] h-1 w-full -translate-y-1/2 start-1/2" style={{ background: s.trackOut, opacity: s.phase === "past" ? 0.45 : 1 }} />
              )}
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                onClick={() => onOpen(s.key)}
                aria-current={current ? "location" : undefined}
                aria-label={t.stopAria.replace("{place}", s.label).replace("{dates}", dates).replace("{nights}", String(s.nights))}
                className="relative flex w-full flex-col items-center gap-1 rounded-xl px-1 pb-1 text-center"
              >
                <span className="h-5 text-sm leading-5" aria-hidden="true">
                  {s.newCountry && s.countryCode ? flagEmoji(s.countryCode) : ""}
                </span>
                <span
                  aria-hidden="true"
                  className={`z-10 rounded-full border-[3px] bg-surface ${current ? "h-5 w-5" : s.newCountry ? "h-4 w-4" : "h-3 w-3"}`}
                  style={{ borderColor: s.color, background: current ? s.color : undefined, opacity: s.phase === "past" ? 0.6 : 1 }}
                />
                <span className={`line-clamp-2 text-[12px] leading-4 ${current ? "font-extrabold text-ink" : "font-semibold text-ink"}`}>{s.label}</span>
                <bdi className="text-[12px] leading-4 text-ink-soft">{formatShortDate(s.from)}</bdi>
                {current && <span className="rounded-full bg-sea px-1.5 text-[12px] font-bold text-on-sea">{t.here}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
