"use client";

import { useId, useMemo, useRef, useState } from "react";
import { findCountry, searchCountries } from "@/lib/countries";
import { strings } from "@/lib/strings";

/**
 * Searchable country picker with flags (F8). Inline (no nested sheet): a
 * button shows the choice, tapping it opens a search field and a list. Trip
 * countries passed in `suggested` are listed first.
 */
export function CountryPicker({
  id,
  value,
  onChange,
  suggested = [],
  labelledBy,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  suggested?: string[];
  labelledBy?: string;
}) {
  const s = strings.countryPicker;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const current = findCountry(value);
  const results = useMemo(() => searchCountries(query, suggested, 60), [query, suggested]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 text-start text-base text-ink"
      >
        {current ? (
          <>
            <span aria-hidden="true" className="text-xl leading-none">{current.flag}</span>
            <span className="flex-1 font-semibold">{current.he}</span>
            <bdi className="text-sm text-ink-soft">{current.code}</bdi>
          </>
        ) : (
          <span className="flex-1 text-ink-soft">{s.choose}</span>
        )}
      </button>

      {open && (
        <div className="rounded-xl border border-line bg-surface p-2 shadow-card">
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={s.search}
            placeholder={s.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                choose(results[0].code);
              }
            }}
            className="w-full rounded-lg bg-paper-deep px-3 py-2 text-base text-ink outline-none"
          />
          <ul id={listId} role="listbox" aria-label={s.listLabel} className="mt-2 max-h-64 overflow-y-auto">
            {value && (
              <li>
                <button type="button" onClick={() => choose("")} className="flex w-full items-center px-3 text-start text-sm font-semibold text-ink-soft">
                  {s.clear}
                </button>
              </li>
            )}
            {results.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button
                  type="button"
                  onClick={() => choose(c.code)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 text-start text-base ${
                    c.code === value ? "bg-sea-tint font-bold text-ink" : "text-ink"
                  }`}
                >
                  <span aria-hidden="true" className="text-xl leading-none">{c.flag}</span>
                  <span className="flex-1">{c.he}</span>
                  <bdi className="text-sm text-ink-soft">{c.code}</bdi>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-3 py-3 text-sm text-ink-soft">{s.noResults}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
