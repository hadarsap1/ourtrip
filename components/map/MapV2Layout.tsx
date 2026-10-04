"use client";

import { useMemo, useState, type ReactNode, type RefObject } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Toast } from "@/components/Toast";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { splitIntoStretches, type Stretch } from "@/lib/data/segments";
import { mapsSearchUrl } from "@/lib/data/placeOptions";
import { flagEmoji, findCountry } from "@/lib/countries";
import { countryHex } from "@/lib/mapV2";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, ItineraryDay } from "@/lib/types";

const t = strings.mapV2;
type Tab = "route" | "days" | "bookings";

function addressOf(b: Booking): string | null {
  const d = b.details;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const a = (d as Record<string, unknown>).address;
  return typeof a === "string" && a.trim() ? a.trim() : null;
}

/**
 * Map v2 (2.9): the map fills the screen and a draggable sheet (peek / half /
 * full) carries three tabs - the route by country stay (tap to frame it, plus
 * the existing pin/route/car tools), day chips in their country's colour, and
 * the bookings with a navigate link.
 */
export function MapV2Layout({
  containerRef,
  noKey,
  days,
  bookings,
  dayFilter,
  onDayFilter,
  onFocusStretch,
  tools,
  overlays,
  toast,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  noKey: boolean;
  days: ItineraryDay[];
  bookings: Booking[];
  dayFilter: string | null;
  onDayFilter: (id: string | null) => void;
  onFocusStretch: (s: Stretch) => void;
  tools: ReactNode;
  overlays: ReactNode;
  toast: string | null;
}) {
  const [tab, setTab] = useState<Tab>("route");
  const stretches = useMemo(() => splitIntoStretches(days), [days]);
  const live = useMemo(
    () => bookings.filter((b) => b.status !== "cancelled").sort((a, b) => (a.start_date ?? "9").localeCompare(b.start_date ?? "9")),
    [bookings]
  );

  return (
    <div className="relative h-[calc(100dvh-5rem)] overflow-hidden lg:h-dvh">
      {noKey ? (
        <p className="m-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">{strings.map.noKey}</p>
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}

      <BottomSheet label={t.sheetLabel} defaultSnap="peek">
        <div className="space-y-3 px-4 pb-6">
          <SegmentedControl
            ariaLabel={t.tabsLabel}
            value={tab}
            onChange={setTab}
            options={[
              { value: "route", label: t.tabRoute },
              { value: "days", label: t.tabDays },
              { value: "bookings", label: t.tabBookings },
            ]}
          />

          {tab === "route" && (
            <>
              <ol className="relative space-y-1 border-s-2 border-line ps-4">
                {stretches.map((s) => (
                  <li key={`${s.from}-${s.locationName}`}>
                    <button
                      type="button"
                      onClick={() => onFocusStretch(s)}
                      className="relative flex w-full items-center justify-between gap-2 rounded-xl px-2 text-start active:bg-paper-deep"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -start-[1.4rem] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ring-2 ring-surface"
                        style={{ background: countryHex(s.countryCode) }}
                      />
                      <span className="flex min-w-0 items-center gap-1.5">
                        {s.countryCode && <span aria-hidden="true">{flagEmoji(s.countryCode)}</span>}
                        <span className="truncate text-sm font-bold text-ink">
                          {s.locationName ?? (s.countryCode ? findCountry(s.countryCode)?.he : "") ?? ""}
                        </span>
                      </span>
                      <bdi className="shrink-0 text-[12px] text-ink-soft">
                        {formatShortDate(s.from)}-{formatShortDate(s.to)} · {t.nights.replace("{n}", String(s.days.length))}
                      </bdi>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="space-y-3 border-t border-line pt-3">{tools}</div>
            </>
          )}

          {tab === "days" && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onDayFilter(null)}
                className={`rounded-full px-3 text-sm font-semibold ${dayFilter === null ? "bg-sea text-on-sea" : "border border-line bg-surface text-ink"}`}
              >
                {t.allDays}
              </button>
              {days.map((d) => {
                const on = dayFilter === d.id;
                const hex = countryHex(d.country_code);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onDayFilter(on ? null : d.id)}
                    className="flex items-center gap-1.5 rounded-full border px-3 text-sm font-semibold"
                    style={on ? { background: hex, borderColor: hex, color: "#fff" } : { borderColor: hex, color: "var(--text)" }}
                  >
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : hex }} />
                    <bdi>{formatShortDate(d.date)}</bdi>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "bookings" &&
            (live.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft">{t.noBookings}</p>
            ) : (
              <ul className="divide-y divide-line">
                {live.map((b) => {
                  const where = addressOf(b);
                  const url = mapsSearchUrl(where ?? b.title);
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{b.title}</span>
                        <span className="block truncate text-[12px] text-ink-soft">
                          {strings.bookings.types[b.type]}
                          {b.start_date && <> · <bdi>{formatShortDate(b.start_date)}</bdi></>}
                          {where && <> · <bdi>{where}</bdi></>}
                        </span>
                      </span>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center rounded-lg bg-sea-tint px-3 text-[13px] font-bold text-sea-deep">
                          {t.navigate}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
        </div>
      </BottomSheet>

      {overlays}
      <Toast message={toast} />
    </div>
  );
}
