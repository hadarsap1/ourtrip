"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { importItinerary } from "@/lib/data/itinerary";
import { parseItinerarySheet, type ParsedItineraryRow } from "@/lib/importItinerary";
import { strings } from "@/lib/strings";

type Preview = { rows: ParsedItineraryRow[]; days: number; skipped: number };

export function ImportItinerarySheet({
  tripId,
  onClose,
  onDone,
}: {
  tripId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const s = strings.itinerary;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const { rows, skipped } = await parseItinerarySheet(file);
      const days = new Set(rows.map((r) => r.date)).size;
      if (rows.length === 0) {
        setError(s.importNothing);
      } else {
        setPreview({ rows, days, skipped });
      }
    } catch {
      setError(s.importFailed);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { daysCreated, itemsCreated, hotelsCreated, duplicatesSkipped } =
        await importItinerary(tripId, preview.rows);
      const base = s.imported
        .replace("{days}", String(daysCreated))
        .replace("{items}", String(itemsCreated))
        .replace("{hotels}", String(hotelsCreated));
      onDone(
        duplicatesSkipped > 0
          ? base + s.importedDuplicates.replace("{n}", String(duplicatesSkipped))
          : base
      );
    } catch {
      setError(s.importFailed);
      setBusy(false);
    }
  }

  const hotelCount = preview?.rows.filter((r) => r.is_lodging).length ?? 0;
  const itemCount = preview?.rows.filter((r) => r.title && !r.is_lodging).length ?? 0;

  return (
    <Sheet open onClose={onClose} title={s.importTitle}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">{s.importHint}</p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          onChange={(e) => void handleFile(e)}
          className="block w-full text-sm text-ink-soft file:ml-3 file:rounded-lg file:border-0 file:bg-sea-tint file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sea"
        />

        {busy && !preview && (
          <p className="text-sm text-ink-soft">{s.importParsing}</p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {preview && (
          <div className="space-y-3">
            <div className="rounded-xl bg-sea-tint/50 px-3 py-2.5 text-sm text-ink">
              {s.importPreview
                .replace("{days}", String(preview.days))
                .replace("{items}", String(itemCount))
                .replace("{hotels}", String(hotelCount))}
              {preview.skipped > 0 && (
                <span className="mt-1 block text-xs text-ink-soft">
                  {s.importSkippedNote.replace("{n}", String(preview.skipped))}
                </span>
              )}
            </div>

            {/* small preview of the first few rows */}
            <ul className="max-h-52 space-y-1 overflow-y-auto text-sm">
              {preview.rows.slice(0, 8).map((r, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm">
                  <span className="shrink-0 font-mono text-xs text-ink-soft" dir="ltr">
                    {r.date}
                    {r.start_time ? ` ${r.start_time}` : ""}
                  </span>
                  <span className="flex-1 truncate text-ink">
                    {r.title || r.location_name || "—"}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => void doImport()}
              disabled={busy}
              className="w-full rounded-xl bg-sea py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? s.importing : s.importDo}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
