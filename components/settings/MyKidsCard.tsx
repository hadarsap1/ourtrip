"use client";

import { useState } from "react";
import { KidNamesField } from "@/components/guests/KidNamesField";
import { setMyKidNames } from "@/lib/data/guests";
import { getActiveTrip } from "@/lib/data/trip";
import { normalizeKidNames } from "@/lib/kidTag";
import { memberChanged, useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.kidTag;

/** A guest's own "של יואב" tag (00067). Guests only; the database lets a
 *  guest change this one column of their own row and nothing else. */
export function MyKidsCard() {
  const { member } = useMember();
  if (member?.role !== "guest") return null;
  // keyed by the saved value, so a fresh read of the row resets the form
  // a row stored on the device before 00067 has no kid_names
  const saved = member.kid_names ?? [];
  return <MyKidsForm key={saved.join("\n")} initial={saved} />;
}

function MyKidsForm({ initial }: { initial: string[] }) {
  const [names, setNames] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = normalizeKidNames(names).join("\n") !== initial.join("\n");

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const trip = await getActiveTrip();
      if (!trip) throw new Error("no trip");
      setNames(await setMyKidNames(trip.id, normalizeKidNames(names)));
      setStatus(t.saved);
      memberChanged();
    } catch {
      setStatus(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.settingsTitle}</h2>
      <p className="mt-1 mb-3 text-[12px] text-ink-soft">{t.settingsHint}</p>
      <KidNamesField id="my-kids" value={names} onChange={setNames} showHint={false} />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="min-h-[44px] rounded-xl bg-sea px-5 text-sm font-bold text-on-sea disabled:opacity-50"
        >
          {t.save}
        </button>
        {status && (
          <p className="text-sm text-ink-soft" role="status">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}
