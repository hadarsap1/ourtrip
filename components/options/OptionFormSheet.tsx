"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { PLACE_CATEGORIES, type PlaceOptionInput } from "@/lib/data/placeOptions";
import { strings } from "@/lib/strings";
import type { PlaceOption } from "@/lib/types";

const FIELD =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-sea";

export function OptionFormSheet({
  open,
  editing,
  countries,
  areas,
  onClose,
  onSave,
}: {
  open: boolean;
  /** An existing option to edit, or null for a new one. */
  editing: PlaceOption | null;
  /** Values already used, offered as datalist suggestions so the same
   *  destination doesn't get typed three slightly different ways. */
  countries: string[];
  areas: string[];
  onClose: () => void;
  onSave: (input: PlaceOptionInput) => void | Promise<void>;
}) {
  const s = strings.options;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [category, setCategory] = useState(editing?.category ?? "hotel");
  const [country, setCountry] = useState(editing?.country ?? "");
  const [area, setArea] = useState(editing?.area ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [sourceUrl, setSourceUrl] = useState(editing?.source_url ?? "");
  const [bookingUrl, setBookingUrl] = useState(editing?.booking_url ?? "");

  return (
    <Sheet open={open} onClose={onClose} title={editing ? s.edit : s.add}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            title,
            category,
            country,
            area,
            note,
            sourceUrl,
            bookingUrl,
            source: editing?.source ?? "manual",
          });
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.optionTitle}</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.category}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD}
          >
            {PLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {s.categories[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{s.country}</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              list="option-countries"
              className={FIELD}
            />
            <datalist id="option-countries">
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
              list="option-areas"
              className={FIELD}
            />
            <datalist id="option-areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.bookingUrl}</span>
          <input
            value={bookingUrl}
            onChange={(e) => setBookingUrl(e.target.value)}
            inputMode="url"
            dir="ltr"
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.sourceUrl}</span>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            inputMode="url"
            dir="ltr"
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{s.note}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className={FIELD}
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-white"
        >
          {s.save}
        </button>
      </form>
    </Sheet>
  );
}
