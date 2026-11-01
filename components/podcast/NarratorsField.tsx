"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { addNarrator } from "@/lib/narrators";
import { strings } from "@/lib/strings";

/**
 * "מי מספרים?" (00079): the kids and the parents as chips, any of them on or
 * off, and a name typed in for someone else. Shows nothing about which phone
 * recorded the episode.
 */
export function NarratorsField({
  id,
  choices,
  value,
  onChange,
}: {
  id: string;
  choices: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [other, setOther] = useState("");
  // a typed name stays a chip after it is added
  const all = [...choices, ...value.filter((n) => !choices.includes(n))];
  const add = () => {
    onChange(addNarrator(value, other));
    setOther("");
  };

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-sv-ink">{strings.podcast.narratorsLabel}</legend>
      <div className="flex flex-wrap gap-2">
        {all.map((name) => {
          const on = value.includes(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((n) => n !== name) : [...value, name])}
              className={`flex min-h-[40px] items-center gap-1 rounded-full border px-3 text-sm font-semibold ${
                on ? "border-sv-sage bg-sv-sage-soft text-sv-sage" : "border-sv-line bg-sv-card text-sv-ink-soft"
              }`}
            >
              {on && <CheckIcon className="h-3.5 w-3.5" />}
              {name}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id={`${id}-other`}
          type="text"
          maxLength={30}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={strings.podcast.narratorOther}
          aria-label={strings.podcast.narratorOther}
          className="min-w-0 flex-1 rounded-2xl border border-sv-line bg-sv-card px-3 py-2 text-sm text-sv-ink focus:border-sv-sage focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!other.trim()}
          aria-label={strings.podcast.narratorAdd}
          className="grid min-h-[40px] min-w-[40px] place-items-center rounded-2xl border border-sv-line text-sv-ink-soft disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </fieldset>
  );
}
