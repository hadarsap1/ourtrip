"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  filterEntries,
  generateLanguage,
  languageName,
  listEntries,
  listLanguages,
  searchLanguages,
  deleteLanguage,
  translatePhrase,
  type LiveTranslation,
} from "@/lib/data/phrasebook";
import { SearchIcon } from "@/components/icons";
import { TranslateBox } from "./TranslateBox";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";
import type { PhrasebookEntry, Trip } from "@/lib/types";

export function PhrasebookScreen() {
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<PhrasebookEntry[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Only the three fields the fullscreen view draws, so a live translation -
  // which is not a saved row - can be shown to a local the same way.
  const [showEntry, setShowEntry] = useState<{
    phrase_he: string;
    phrase_local: string;
    phonetic_he: string | null;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [translation, setTranslation] = useState<LiveTranslation | null>(null);
  const [translating, setTranslating] = useState(false);

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
      // offline-critical: trip may be unreachable - cached languages still load
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

  async function handleDeleteLanguage() {
    if (!trip || !selected || generating) return;
    if (!confirm(strings.phrasebook.deleteLanguageConfirm)) return;
    try {
      await deleteLanguage(trip.id, selected);
      const { languages: langs } = await listLanguages(trip.id);
      setLanguages(langs);
      const next = langs[0] ?? null;
      setSelected(next);
      setQuery("");
      if (next) await loadEntries(trip.id, next);
      else setEntries([]);
      showToast(strings.phrasebook.deleted);
    } catch {
      showToast(strings.phrasebook.deleteFailed);
    }
  }

  async function handleTranslate() {
    const text = draft.trim();
    if (text === "" || !selected || translating) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showToast(strings.phrasebook.translateOffline);
      return;
    }
    setTranslating(true);
    setTranslation(null);
    try {
      setTranslation(await translatePhrase(text, selected));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      showToast(
        code === "not_configured"
          ? strings.phrasebook.notConfigured
          : code === "no_credit"
            ? strings.phrasebook.translateNoCredit
            : strings.phrasebook.translateFailed
      );
    } finally {
      setTranslating(false);
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
  const visible = filterEntries(entries, query);
  const grouped = new Map<string, PhrasebookEntry[]>();
  for (const entry of visible) {
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

      {/* Owner-only because it spends API credit, so the box is hidden rather
          than shown to a kid and then refused. */}
      {isOwner && selected && (
        <TranslateBox
          draft={draft}
          onDraftChange={setDraft}
          onTranslate={() => void handleTranslate()}
          translating={translating}
          translation={translation}
          onShow={setShowEntry}
        />
      )}

      {selected && entries.length > 0 && (
        <>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={strings.phrasebook.search}
              className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
            />
          </label>
          {query.trim() !== "" && visible.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
              {strings.phrasebook.searchNone}
            </p>
          )}
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
          {trip && !fromCache && query.trim() === "" && isOwner && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleGenerate(selected)}
                disabled={generating}
                className="min-w-0 flex-1 rounded-2xl border border-line py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-deep disabled:opacity-50"
              >
                {generating
                  ? strings.phrasebook.generating
                  : `${strings.phrasebook.regenerate} - ${languageName(selected)}`}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteLanguage()}
                disabled={generating}
                className="shrink-0 rounded-2xl border border-alert/40 px-4 py-2.5 text-sm font-semibold text-alert hover:bg-alert-tint disabled:opacity-50"
              >
                {strings.common.delete}
              </button>
            </div>
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
        existing={languages}
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

/**
 * Picks a language by SEARCHING its name.
 *
 * It used to be a row of chips plus a field asking for an ISO 639 code, which
 * assumes you know that Khmer is "km" and Georgian is "ka" - and this trip
 * needs both. Now you type "חמר" and tap the result. With the box empty the
 * list still opens on the six languages this trip actually needs.
 */
function AddLanguageSheet({
  open,
  generating,
  existing,
  onClose,
  onGenerate,
}: {
  open: boolean;
  generating: boolean;
  /** Already in the phrasebook, so they are marked rather than offered twice. */
  existing: string[];
  onClose: () => void;
  onGenerate: (language: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query), [query]);

  if (!open) return null;

  return (
    <Sheet open onClose={onClose} title={strings.phrasebook.addLanguage}>
      <label className="mb-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
        <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={strings.phrasebook.languageSearch}
          className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
        />
      </label>

      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {strings.phrasebook.languageNone}
        </p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {results.map((language) => {
            const already = existing.includes(language.code);
            return (
              <li key={language.code}>
                <button
                  type="button"
                  disabled={generating || already}
                  onClick={() => onGenerate(language.code)}
                  className="flex w-full items-center gap-2 py-3 text-start disabled:opacity-45"
                >
                  <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
                    {language.name}
                  </span>
                  {already && (
                    <span className="shrink-0 text-[11.5px] text-ink-soft">
                      {strings.phrasebook.languageAlready}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
