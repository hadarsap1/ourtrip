"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { LoadFailed } from "@/components/LoadFailed";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { countryName } from "@/lib/data/emergency";
import {
  addQuote,
  deleteQuote,
  draftIsValid,
  listQuotes,
  setQuoteShared,
  subscribeQuotes,
  updateQuote,
  type JarDraft,
} from "@/lib/data/jar";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import { formatDate, todayISO } from "@/lib/format";
import { spreadDelay } from "@/lib/realtimeTopic";
import { strings } from "@/lib/strings";
import type { JarQuote, Member } from "@/lib/types";
import { useMember } from "@/lib/useMember";

// "הישר לצנצנת" (00091). Parents write; kids read; a guest sees only the
// quotes a parent shared. The buttons below are hidden by role for clarity,
// but the boundary is RLS: a kid's or a guest's write is refused by the
// database, and a guest's select never returns an unshared row.

const emptyDraft = (): JarDraft => ({
  quote: "",
  meant: "",
  background: "",
  saidBy: [],
  saidByOther: [],
  saidOn: todayISO(),
});

export function JarScreen() {
  const s = strings.jar;
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const isGuest = member?.role === "guest";

  const [tripId, setTripId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<JarQuote[]>([]);
  const [family, setFamily] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JarQuote | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<JarDraft>(emptyDraft);
  const [otherName, setOtherName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const load = useCallback(async () => {
    const trip = await getActiveTrip().catch(() => null);
    if (!trip) {
      setLoading(false);
      return;
    }
    try {
      const [rows, members] = await Promise.all([listQuotes(trip.id), listMembers(trip.id)]);
      setTripId(trip.id);
      setQuotes(rows);
      setFamily(members.filter((m) => m.role === "owner" || m.role === "kid"));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // after the first paint, so the effect itself sets no state
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  // the other parent's phone adds a quote: refetch, spread a little
  useEffect(() => {
    if (!tripId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeQuotes(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), spreadDelay(300));
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [tripId, load]);

  const nameOf = useCallback(
    (id: string) => family.find((m) => m.id === id)?.display_name ?? null,
    [family]
  );

  function openAdd() {
    setDraft(emptyDraft());
    setOtherName("");
    setEditing(null);
    setAdding(true);
  }

  function openEdit(q: JarQuote) {
    setDraft({
      quote: q.quote,
      meant: q.meant ?? "",
      background: q.background ?? "",
      saidBy: q.said_by,
      saidByOther: q.said_by_other,
      saidOn: q.said_on,
    });
    setOtherName("");
    setAdding(false);
    setEditing(q);
  }

  function closeSheet() {
    setAdding(false);
    setEditing(null);
  }

  function toggleSpeaker(id: string) {
    setDraft((d) => ({
      ...d,
      saidBy: d.saidBy.includes(id) ? d.saidBy.filter((x) => x !== id) : [...d.saidBy, id],
    }));
  }

  function addOther() {
    const name = otherName.trim();
    if (name === "") return;
    setDraft((d) => (d.saidByOther.includes(name) ? d : { ...d, saidByOther: [...d.saidByOther, name] }));
    setOtherName("");
  }

  // a name typed but not yet added still counts on save
  const effectiveDraft: JarDraft =
    otherName.trim() === "" ? draft : { ...draft, saidByOther: [...draft.saidByOther, otherName.trim()] };

  async function save() {
    if (!tripId || busy || !draftIsValid(effectiveDraft)) return;
    setBusy(true);
    try {
      if (editing) await updateQuote(tripId, editing.id, effectiveDraft);
      else await addQuote(tripId, effectiveDraft, member?.id ?? null);
      closeSheet();
      await load();
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShared(q: JarQuote) {
    const next = !q.shared_with_guests;
    setQuotes((list) => list.map((x) => (x.id === q.id ? { ...x, shared_with_guests: next } : x)));
    try {
      await setQuoteShared(q.id, next);
      showToast(next ? s.shared : s.unshared);
    } catch {
      setQuotes((list) => list.map((x) => (x.id === q.id ? { ...x, shared_with_guests: !next } : x)));
      showToast(strings.common.error);
    }
  }

  async function remove(q: JarQuote) {
    if (!(await askConfirm(s.deleteConfirm))) return;
    try {
      await deleteQuote(q.id);
      setQuotes((list) => list.filter((x) => x.id !== q.id));
    } catch {
      showToast(strings.common.error);
    }
  }

  const speakers = (q: JarQuote) =>
    [...q.said_by.map(nameOf).filter((n): n is string => n !== null), ...q.said_by_other];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8 sm:max-w-2xl">
      <header>
        <h1 className="ot-title">{s.title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{s.subtitle}</p>
        {quotes.length > 0 && (
          <p className="mt-1 text-xs text-ink-faint">{s.count.replace("{n}", String(quotes.length))}</p>
        )}
      </header>

      {isOwner && tripId && (
        <button
          type="button"
          onClick={openAdd}
          className="min-h-[44px] w-full rounded-2xl bg-sea py-3 text-sm font-bold text-on-sea"
        >
          {s.add}
        </button>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-ink-soft">{strings.common.loading}</p>
      ) : failed ? (
        <LoadFailed onRetry={load} />
      ) : quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">{s.empty}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {isOwner ? s.emptyOwner : isGuest ? s.emptyGuest : s.emptyKid}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {quotes.map((q) => {
            const who = speakers(q);
            return (
              <li key={q.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <p className="text-lg font-semibold leading-relaxed text-ink">״{q.quote}״</p>
                {q.meant && (
                  <p className="mt-1 text-sm text-ink-soft">
                    {s.meantPrefix} {q.meant}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {who.map((name) => (
                    <span key={name} className="rounded-full bg-sea-tint px-2 py-0.5 font-semibold text-sea-deep">
                      {name}
                    </span>
                  ))}
                  <span className="text-ink-faint">
                    {formatDate(q.said_on)}
                    {q.country_code && ` · ${countryName(q.country_code)}`}
                  </span>
                </div>
                {q.background && (
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{q.background}</p>
                )}
                {isOwner && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2.5 text-xs">
                    <label className="flex min-h-[44px] items-center gap-2 font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={q.shared_with_guests}
                        onChange={() => void toggleShared(q)}
                        className="h-4 w-4 accent-sea"
                      />
                      {q.shared_with_guests ? s.shareLabel : s.shareOff}
                    </label>
                    <span className="flex-1" />
                    <button type="button" onClick={() => openEdit(q)} className="min-h-[44px] font-semibold text-sea">
                      {strings.common.edit}
                    </button>
                    <button type="button" onClick={() => void remove(q)} className="min-h-[44px] font-semibold text-alert">
                      {strings.common.delete}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(adding || editing) && (
        <Sheet open onClose={closeSheet} title={editing ? s.editTitle : s.add}>
          <label className="block text-sm font-medium text-ink">
            {s.quoteLabel}
            <textarea
              value={draft.quote}
              onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
              rows={3}
              placeholder={s.quotePlaceholder}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-ink">
            {s.meantLabel}
            <input
              value={draft.meant}
              onChange={(e) => setDraft((d) => ({ ...d, meant: e.target.value }))}
              placeholder={s.meantPlaceholder}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-ink">
              {s.saidByLabel} <span className="text-xs font-normal text-ink-faint">· {s.saidByHint}</span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {family.map((m) => {
                const on = draft.saidBy.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSpeaker(m.id)}
                    className={`min-h-[44px] rounded-full px-3.5 text-sm font-semibold ${
                      on ? "bg-sea text-on-sea" : "border border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {m.display_name}
                  </button>
                );
              })}
              {draft.saidByOther.map((name) => (
                <button
                  key={`other-${name}`}
                  type="button"
                  aria-label={s.otherRemove.replace("{name}", name)}
                  onClick={() => setDraft((d) => ({ ...d, saidByOther: d.saidByOther.filter((n) => n !== name) }))}
                  className="min-h-[44px] rounded-full bg-sea px-3.5 text-sm font-semibold text-on-sea"
                >
                  {name} ✕
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOther();
                  }
                }}
                aria-label={s.otherLabel}
                placeholder={s.otherPlaceholder}
                className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-base"
              />
              <button
                type="button"
                onClick={addOther}
                disabled={otherName.trim() === ""}
                className="min-h-[44px] shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-sea disabled:opacity-40"
              >
                {s.otherAdd}
              </button>
            </div>
          </fieldset>

          <label className="mt-3 block text-sm font-medium text-ink">
            {s.saidOnLabel}
            <input
              type="date"
              value={draft.saidOn}
              onChange={(e) => setDraft((d) => ({ ...d, saidOn: e.target.value || todayISO() }))}
              className="mt-1 block rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-ink">
            {s.backgroundLabel}
            <textarea
              value={draft.background}
              onChange={(e) => setDraft((d) => ({ ...d, background: e.target.value }))}
              rows={3}
              placeholder={s.backgroundPlaceholder}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
            />
          </label>

          {draft.quote.trim() !== "" && !draftIsValid(effectiveDraft) && (
            <p className="mt-2 text-xs font-medium text-alert">{s.needSpeaker}</p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !draftIsValid(effectiveDraft)}
            className="mt-3 w-full rounded-2xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-40"
          >
            {strings.common.save}
          </button>
        </Sheet>
      )}

      <Toast message={toast} />
    </div>
  );
}
