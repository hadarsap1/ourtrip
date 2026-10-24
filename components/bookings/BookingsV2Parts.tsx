"use client";

import { useState, type ComponentType } from "react";
import { ClipboardIcon, CheckIcon, type IconProps } from "@/components/icons";
import { bookingFacts, countByType } from "@/lib/bookingsV2";
import { strings } from "@/lib/strings";
import type { Booking, BookingType } from "@/lib/types";

const t = strings.bookingsV2;

/** Tile grid: one tile per booking type with its count; tapping filters the list. */
export function TypeTiles({
  bookings,
  icons,
  value,
  onChange,
}: {
  bookings: Booking[];
  icons: Record<BookingType, ComponentType<IconProps>>;
  value: BookingType | null;
  onChange: (t: BookingType | null) => void;
}) {
  const counts = countByType(bookings);
  if (counts.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={t.tilesLabel} className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        className={`flex flex-col items-center justify-center rounded-2xl border px-2 py-2 text-sm font-bold ${value === null ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink"}`}
      >
        <span className="text-lg tabular-nums">{counts.reduce((s, c) => s + c.count, 0)}</span>
        <span className="text-[12px] font-semibold">{t.all}</span>
      </button>
      {counts.map(({ type, count }) => {
        const Icon = icons[type];
        const on = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : type)}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-2 ${on ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink"}`}
          >
            <span className="flex items-center gap-1 text-lg font-bold tabular-nums">
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {count}
            </span>
            <span className="text-[12px] font-semibold">{strings.bookings.types[type]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Rich-card strip: big times, flight/terminal/gate chips, copyable confirmation code. */
export function BookingFactsStrip({ booking }: { booking: Booking }) {
  const f = bookingFacts(booking);
  const [copied, setCopied] = useState(false);
  const chips = [f.flightNumber, f.terminal && t.terminal.replace("{t}", f.terminal), f.gate && t.gate.replace("{g}", f.gate), f.provider].filter(Boolean) as string[];
  if (!f.timesKind && chips.length === 0 && !booking.confirmation_code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(booking.confirmation_code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked - the code is on screen anyway
    }
  }

  return (
    <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
      {f.timesKind && (
        <div className="flex items-end justify-between gap-3">
          <span>
            <span className="block text-[12px] text-ink-soft">{f.timesKind === "travel" ? t.departs : t.checkIn}</span>
            <bdi className="block text-[22px] font-extrabold leading-7 tabular-nums text-ink">{f.from ?? "-"}</bdi>
          </span>
          <span aria-hidden="true" className="mb-2 h-px flex-1 border-t border-dashed border-line" />
          <span className="text-end">
            <span className="block text-[12px] text-ink-soft">{f.timesKind === "travel" ? t.arrives : t.checkOut}</span>
            <bdi className="block text-[22px] font-extrabold leading-7 tabular-nums text-ink">{f.to ?? "-"}</bdi>
          </span>
        </div>
      )}
      {(chips.length > 0 || booking.confirmation_code) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <bdi key={c} className="rounded-md bg-paper-deep px-2 py-0.5 text-[12px] font-semibold text-ink">
              {c}
            </bdi>
          ))}
          {booking.confirmation_code && (
            <button
              type="button"
              onClick={() => void copy()}
              aria-label={t.copy}
              className="ms-auto flex items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] font-bold text-ink"
            >
              {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <ClipboardIcon className="h-4 w-4" />}
              <bdi className="tabular-nums">{copied ? t.copied : booking.confirmation_code}</bdi>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
