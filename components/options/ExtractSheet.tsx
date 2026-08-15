"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  extractPlacesFromText,
  mapsSearchUrl,
  type ExtractedPlace,
  type PlaceOptionInput,
} from "@/lib/data/placeOptions";
import { strings } from "@/lib/strings";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea";

type Phase = "input" | "running" | "review";

/** Paste a post → Claude returns candidates → the owner ticks what to keep.
 *  Nothing is saved until they do; the extraction itself is throwaway. */
export function ExtractSheet({
  open,
  countries,
  areas,
  onClose,
  onSave,
}: {
  open: boolean;
  countries: string[];
  areas: string[];
  onClose: () => void;
  onSave: (inputs: PlaceOptionInput[]) => void | Promise<void>;
}) {
  const s = strings.options;

  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const [found, setFound] = useState<ExtractedPlace[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase("input");
    setText("");
    setSourceUrl("");
    setFound([]);
    setPicked(new Set());
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const run = async () => {
    if (text.trim().length < 10) {
      setError(s.importTooShort);
      return;
    }
    setError(null);
    setPhase("running");
    try {
      const places = await extractPlacesFromText(text, {
        country: country || null,
        area: area || null,
      });
      setFound(places);
      // Default to everything ticked: the common case is "yes, save these".
      setPicked(new Set(places.map((_, i) => i)));
      setPhase("review");
    } catch (err) {
      // The message here is the function's own error CODE (see
      // lib/functionError.ts) — an exact match, not a substring guess.
      const code = (err as Error).message ?? "";
      setError(
        code === "not_configured"
          ? s.importNotConfigured
          : code === "no_credit"
            ? s.importNoCredit
            : s.importFailed
      );
      setPhase("input");
    }
  };

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const save = async () => {
    const inputs: PlaceOptionInput[] = found
      .filter((_, i) => picked.has(i))
      .map((p) => {
        const placeArea = p.area ?? area ?? null;
        return {
          title: p.title,
          category: p.category,
          country: country || null,
          area: placeArea,
          note: p.note,
          sourceUrl: sourceUrl || null,
          // A link the post gave for this place, if any.
          bookingUrl: p.url,
          // Always a way to find it on a map, even when the post gave no link.
          mapsUrl: mapsSearchUrl(p.title, placeArea, country || null),
          source: "facebook",
        };
      });
    await onSave(inputs);
    reset();
  };

  return (
    <Sheet open={open} onClose={close} title={s.importTitle}>
      {phase === "review" ? (
        <div className="space-y-3">
          {found.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-soft">
              {s.importNone}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">{s.importFound}</p>
              <ul className="space-y-2">
                {found.map((p, i) => (
                  <li key={`${p.title}-${i}`}>
                    <label className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3">
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-1 h-5 w-5 shrink-0 accent-sea"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.title}</span>
                        <span className="block text-xs text-ink-soft">
                          {s.categories[p.category as keyof typeof s.categories] ??
                            s.categories.other}
                          {p.area ? ` · ${p.area}` : ""}
                        </span>
                        {p.note && (
                          <span className="mt-1 block text-xs text-ink-soft">
                            {p.note}
                          </span>
                        )}
                        {p.url && (
                          <span className="mt-1 block truncate text-xs text-sea" dir="ltr">
                            {p.url}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void save()}
                disabled={picked.size === 0}
                className="w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-50"
              >
                {s.importSaveSelected} ({picked.size})
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl bg-paper-deep p-3 text-xs leading-relaxed text-ink-soft">
            {s.importIntro}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{s.country}</span>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                list="extract-countries"
                className={FIELD}
              />
              <datalist id="extract-countries">
                {countries.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{s.area}</span>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                list="extract-areas"
                className={FIELD}
              />
              <datalist id="extract-areas">
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">{s.importText}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              {s.importSourceUrl}
            </span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              inputMode="url"
              dir="ltr"
              className={FIELD}
            />
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="button"
            onClick={() => void run()}
            disabled={phase === "running"}
            className="w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-60"
          >
            {phase === "running" ? s.importRunning : s.importRun}
          </button>
        </div>
      )}
    </Sheet>
  );
}
