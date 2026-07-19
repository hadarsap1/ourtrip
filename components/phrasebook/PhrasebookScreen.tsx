"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  COMMON_LANGUAGES,
  generateLanguage,
  languageName,
  listEntries,
  listLanguages,
} from "@/lib/data/phrasebook";
import { strings } from "@/lib/strings";
import type { PhrasebookEntry, Trip } from "@/lib/types";

export function PhrasebookScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<PhrasebookEntry[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [showEntry, setShowEntry] = useState<PhrasebookEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadEntries = useCallback(async (tripId: string, language: string) => {
    const result = await listEntries(tripId, language);
    setEntries(result.entries);
    setFromCache(result.fromCache);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // offline-critical: trip may be unreachable — cached languages still load
      const activeTrip = await getActiveTrip();
      if (!cancelled) setTrip(activeTrip);
      const tripId = activeTrip?.id ?? "";
      const { languages: langs } = await listLanguages(tripId);
      if (cancelled) return;
      setLanguages(langs);
      if (langs.length > 0) {
        setSelected(langs[0]);
        await loadEntries(tripId, langs[0]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEntries]);

  async function selectLanguage(language: string) {
    setSelected(language);
    await loadEntries(trip?.id ?? "", language);
  }

  async function handleGenerate(language: string) {
    if (generating || !language) return;
    setGenerating(true);
    setAddOpen(false);
    showToast(strings.phrasebook.generating);
    try {
      await generateLanguage(language);
      const tripId = trip?.id ?? "";
      const { languages: langs } = await listLanguages(tripId);
      setLanguages(langs);
      setSelected(language);
      await loadEntries(tripId, language);
      showToast(strings.phrasebook.generated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      showToast(
        msg === "not_configured"
          ? strings.phrasebook.notConfigured
          : strings.phrasebook.generateFailed
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  // group by category, preserving entry order
  const grouped = new Map<string, PhrasebookEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.phrasebook.title}</h1>

      {fromCache && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
          {strings.offline.fromCache}
        </p>
      )}

      {languages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.phrasebook.empty}
        </p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {languages.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => void selectLanguage(lang)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                selected === lang
                  ? "bg-sea text-white"
                  : "bg-white text-ink-soft shadow-sm"
              }`}
            >
              {languageName(lang)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={generating}
            className="shrink-0 rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-ink-soft disabled:opacity-50"
          >
            + {strings.phrasebook.addLanguage}
          </button>
        </div>
      )}

      {languages.length === 0 && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={generating}
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep disabled:opacity-60"
        >
          {generating ? strings.phrasebook.generating : strings.phrasebook.addLanguage}
        </button>
      )}

      {selected && entries.length > 0 && (
        <>
          <p className="text-xs text-ink-soft">{strings.phrasebook.showToLocalHint}</p>
          {[...grouped.entries()].map(([category, categoryEntries]) => (
            <section
              key={category}
              className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
            >
              <h2 className="border-b border-line bg-paper-deep px-3 py-2 text-sm font-bold text-ink">
                {category}
              </h2>
              <ul className="divide-y divide-line">
                {categoryEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setShowEntry(entry)}
                      className="block w-full px-3 py-2.5 text-start"
                    >
                      <span className="block font-medium text-ink">
                        {entry.phrase_he}
                      </span>
                      <span className="block text-sm text-sea" dir="auto">
                        {entry.phrase_local}
                      </span>
                      {entry.phonetic_he && (
                        <span className="block text-xs text-ink-soft">
                          {entry.phonetic_he}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {trip && !fromCache && (
            <button
              type="button"
              onClick={() => void handleGenerate(selected)}
              disabled={generating}
              className="w-full rounded-2xl border border-line py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-deep disabled:opacity-50"
            >
              {generating
                ? strings.phrasebook.generating
                : `${strings.phrasebook.regenerate} — ${languageName(selected)}`}
            </button>
          )}
        </>
      )}

      {selected && entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.phrasebook.emptyLanguage}
        </p>
      )}

      <AddLanguageSheet
        open={addOpen}
        generating={generating}
        onClose={() => setAddOpen(false)}
        onGenerate={(language) => void handleGenerate(language)}
      />

      {/* "show to local" mode: fullscreen, giant native-script phrase */}
      {showEntry && (
        <button
          type="button"
          onClick={() => setShowEntry(null)}
          aria-label={strings.common.close}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-white p-6"
        >
          <span className="text-4xl font-bold leading-relaxed text-ink" dir="auto">
            {showEntry.phrase_local}
          </span>
          <span className="text-lg text-ink-soft">{showEntry.phrase_he}</span>
          {showEntry.phonetic_he && (
            <span className="text-base text-ink-soft">
              {strings.phrasebook.phonetic}: {showEntry.phonetic_he}
            </span>
          )}
        </button>
      )}

      <Toast message={toast} />
    </div>
  );
}

function AddLanguageSheet({
  open,
  generating,
  onClose,
  onGenerate,
}: {
  open: boolean;
  generating: boolean;
  onClose: () => void;
  onGenerate: (language: string) => void;
}) {
  const [picked, setPicked] = useState("");
  const [custom, setCustom] = useState("");

  if (!open) return null;
  const language = custom.trim().toLowerCase() || picked;

  return (
    <Sheet open onClose={onClose} title={strings.phrasebook.addLanguage}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.phrasebook.languageSelect}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setPicked(code);
                  setCustom("");
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  picked === code && !custom
                    ? "bg-sea text-white"
                    : "bg-paper-deep text-ink-soft"
                }`}
              >
                {languageName(code)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="pb-custom"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.phrasebook.customCode}
          </label>
          <input
            id="pb-custom"
            type="text"
            maxLength={3}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="ja"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
            dir="ltr"
          />
        </div>

        <button
          type="button"
          disabled={!language || generating}
          onClick={() => onGenerate(language)}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
        >
          {strings.phrasebook.generate}
        </button>
      </div>
    </Sheet>
  );
}
