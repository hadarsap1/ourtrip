"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import {
  addFact,
  countFactsByDestination,
  deleteFact,
  destinationForDate,
  destinationKey,
  generateFacts,
  listDestinations,
  listFacts,
  updateFact,
  type Destination,
} from "@/lib/data/facts";
import { todayISO } from "@/lib/format";
import { getActiveTrip } from "@/lib/data/trip";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { DestinationFact, Trip } from "@/lib/types";

// "הידעת" - one screen the kids open themselves.
//
// It opens on where the family is today (or, before departure, where they are
// going first) rather than on a picker, because a kid who has to choose a
// destination from a list of fourteen before reading anything will not read
// anything. The picker is still there, above, for the ones who want Japan in
// November.
//
// Owners see the same screen plus the controls. Kids cannot generate, add,
// edit or delete - not because the buttons are hidden, but because the RLS
// policy in 00032 only grants them select.
export function FactsScreen() {
  const s = strings.facts;
  const { member } = useMember();
  const isOwner = member?.role === "owner";

  const [trip, setTrip] = useState<Trip | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Destination | null>(null);
  const [facts, setFacts] = useState<DestinationFact[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DestinationFact | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ fact: "", emoji: "" });
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const loadFacts = useCallback(async (tripId: string, dest: Destination) => {
    const result = await listFacts(tripId, dest.countryCode, dest.locationName);
    setFacts(result.facts);
    setFromCache(result.fromCache);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip().catch(() => null);
      const list = await listDestinations(activeTrip?.id ?? "").catch(
        () => [] as Destination[]
      );
      // Owner-only: kids have no policy on the aggregate and do not need it.
      const factCounts =
        activeTrip && member?.role === "owner"
          ? await countFactsByDestination(activeTrip.id).catch(
              () => new Map<string, number>()
            )
          : new Map<string, number>();
      const opening = destinationForDate(list, todayISO());
      if (cancelled) return;
      setTrip(activeTrip);
      setDestinations(list);
      setCounts(factCounts);
      setSelected(opening);
      if (activeTrip && opening) await loadFacts(activeTrip.id, opening);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFacts, member?.role]);

  async function select(dest: Destination) {
    setSelected(dest);
    setFacts([]);
    if (trip) await loadFacts(trip.id, dest);
  }

  async function runGenerate() {
    if (!trip || !selected || busy) return;
    if (facts.some((f) => f.source === "ai") && !(await askConfirm(s.regenerateConfirm))) {
      return;
    }
    setBusy(true);
    try {
      const n = await generateFacts(selected.countryCode, selected.locationName);
      await loadFacts(trip.id, selected);
      setCounts((prev) =>
        new Map(prev).set(
          destinationKey(selected.countryCode, selected.locationName),
          n
        )
      );
      showToast(s.generated.replace("{n}", String(n)));
    } catch (err) {
      const code = (err as Error).message;
      showToast(
        code === "not_configured"
          ? s.notConfigured
          : code === "no_credit"
            ? s.noCredit
            : s.generateFailed
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!trip || !selected || draft.fact.trim() === "") return;
    setBusy(true);
    try {
      const emoji = draft.emoji.trim() || null;
      if (editing) {
        await updateFact(editing.id, draft.fact.trim(), emoji);
      } else {
        await addFact(
          trip.id,
          selected.countryCode,
          selected.locationName,
          draft.fact.trim(),
          emoji,
          member?.id ?? null
        );
      }
      await loadFacts(trip.id, selected);
      setEditing(null);
      setAdding(false);
      setDraft({ fact: "", emoji: "" });
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function removeFact(fact: DestinationFact) {
    if (!trip || !selected || !(await askConfirm(s.deleteConfirm))) return;
    await deleteFact(fact.id).catch(() => showToast(strings.common.error));
    await loadFacts(trip.id, selected);
  }

  const aiFacts = facts.filter((f) => f.source === "ai").length;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8 sm:max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{s.subtitle}</p>
      </header>

      {fromCache && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
          {strings.offline.fromCache}
        </p>
      )}

      {destinations.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {destinations.map((dest) => {
            const key = destinationKey(dest.countryCode, dest.locationName);
            const on =
              selected != null &&
              destinationKey(selected.countryCode, selected.locationName) === key;
            const n = counts.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => void select(dest)}
                className={`min-h-[40px] shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  on ? "bg-sea text-white" : "bg-white text-ink-soft shadow-sm"
                }`}
              >
                {dest.locationName}
                {isOwner && (
                  <span className={on ? "text-white/70" : "text-ink-faint"}>
                    {" "}
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {strings.common.loading}
        </p>
      ) : facts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink">
            {isOwner ? s.empty : s.emptyKid}
          </p>
          {isOwner && (
            <p className="mt-1 text-xs text-ink-soft">{s.emptyOwner}</p>
          )}
        </div>
      ) : (
        <>
          {isOwner && aiFacts > 0 && (
            <p className="rounded-xl bg-sun-tint px-3 py-2 text-xs text-sun-deep">
              {s.verifyHint}
            </p>
          )}
          <ul className="space-y-2.5">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm"
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {fact.emoji ?? "✨"}
                </span>
                <div className="min-w-0 flex-1">
                  {/* Kids read this, so it is set larger than body copy. */}
                  <p className="text-[15.5px] leading-relaxed text-ink">
                    {fact.fact}
                  </p>
                  {isOwner && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {fact.source === "manual" && (
                        <span className="text-ink-faint">{s.byHand}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(fact);
                          setDraft({
                            fact: fact.fact,
                            emoji: fact.emoji ?? "",
                          });
                        }}
                        className="font-semibold text-sea"
                      >
                        {strings.common.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFact(fact)}
                        className="font-semibold text-alert"
                      >
                        {strings.common.delete}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {isOwner && selected && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={busy}
            className="rounded-2xl bg-sea py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? s.generating : aiFacts > 0 ? s.regenerate : s.generate}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setDraft({ fact: "", emoji: "" });
            }}
            disabled={busy}
            className="rounded-2xl border border-line bg-white py-3 text-sm font-bold text-sea disabled:opacity-60"
          >
            {s.addFact}
          </button>
        </div>
      )}

      {(adding || editing) && (
        <Sheet
          open
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          title={editing ? s.editFact : s.addFact}
        >
          <label className="block text-sm font-medium text-ink">
            {s.emojiLabel}
            <input
              value={draft.emoji}
              onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
              maxLength={4}
              className="mt-1 w-20 rounded-xl border border-line px-3 py-2 text-2xl"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink">
            {s.factLabel}
            <textarea
              value={draft.fact}
              onChange={(e) => setDraft((d) => ({ ...d, fact: e.target.value }))}
              rows={4}
              placeholder={s.factPlaceholder}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy || draft.fact.trim() === ""}
            className="mt-3 w-full rounded-2xl bg-sea py-3 font-semibold text-white disabled:opacity-40"
          >
            {strings.common.save}
          </button>
        </Sheet>
      )}

      <Toast message={toast} />
    </div>
  );
}
