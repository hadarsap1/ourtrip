"use client";

import type { LiveTranslation } from "@/lib/data/phrasebook";
import { strings } from "@/lib/strings";

// Live translation, for what the phrasebook could not anticipate: standing in a
// pharmacy needing to say something nobody put in a list of 47 phrases.
//
// Presentational on purpose - it takes exactly what it draws, so it can be
// looked at without a session, a trip and a generated phrasebook behind it.
export function TranslateBox({
  draft,
  onDraftChange,
  onTranslate,
  translating,
  translation,
  onShow,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onTranslate: () => void;
  translating: boolean;
  translation: LiveTranslation | null;
  onShow: (translation: LiveTranslation) => void;
}) {
  const s = strings.phrasebook;
  return (
    <section className="rounded-2xl border border-line bg-white p-3.5">
      <h2 className="text-[13.5px] font-bold text-ink">{s.translateTitle}</h2>
      <p className="mt-0.5 text-[11.5px] text-ink-soft">{s.translateHint}</p>

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onTranslate();
          }}
          maxLength={300}
          placeholder={s.translatePlaceholder}
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-base"
        />
        <button
          type="button"
          onClick={onTranslate}
          disabled={translating || draft.trim() === ""}
          // Fixed width so the field does not jump when the label changes to
          // "מתרגם…", which is exactly when someone is watching it.
          className="w-[86px] shrink-0 rounded-xl bg-sea px-2 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {translating ? s.translating : s.translateCta}
        </button>
      </div>

      {translation && (
        <div className="mt-3 rounded-xl bg-paper-deep p-3">
          <p className="text-[11px] font-bold text-ink-soft">
            {s.translateResult}
          </p>
          {/* dir="auto" so Japanese, Georgian and Vietnamese each lay out
              correctly inside an RTL page. */}
          <p className="mt-1 text-lg font-bold text-sea" dir="auto">
            {translation.phrase_local}
          </p>
          {translation.phonetic_he && (
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              {s.phonetic}: {translation.phonetic_he}
            </p>
          )}
          <button
            type="button"
            onClick={() => onShow(translation)}
            className="mt-2 text-[12.5px] font-bold text-sea"
          >
            {s.translateShow} ←
          </button>
        </div>
      )}
    </section>
  );
}
