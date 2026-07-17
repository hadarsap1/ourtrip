"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  createJournalEntry,
  deleteJournalEntry,
  getAutoLocation,
  listJournal,
  setJournalShared,
  type JournalEntry,
} from "@/lib/data/journal";
import { uploadPhoto } from "@/lib/data/photos";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Member, Trip } from "@/lib/types";

const MOODS = ["🤩", "😀", "🙂", "😐", "🙁", "😴"];

export function JournalScreen() {
  const { member } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setEntries(await listJournal(tripId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
        const tripMembers = await listMembers(activeTrip.id);
        if (!cancelled) setMembers(tripMembers);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  async function handlePublish() {
    if (!trip || !member || !body.trim() || saving) return;
    setSaving(true);
    try {
      // auto-tag: entry_date = today (createJournalEntry), location from
      // today's itinerary day (Sprint 6 acceptance)
      const locationName = await getAutoLocation(trip.id);
      const entry = await createJournalEntry({
        tripId: trip.id,
        authorId: member.id,
        body,
        mood,
        locationName,
      });
      if (photo) {
        await uploadPhoto({
          tripId: trip.id,
          memberId: member.id,
          isOwner: member.role === "owner",
          file: photo,
          journalEntryId: entry.id,
        });
      }
      setBody("");
      setMood(null);
      setPhoto(null);
      await refresh(trip.id);
      showToast(strings.journal.saved);
    } catch {
      showToast(strings.common.error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-slate-500">{strings.common.loading}</p>
      </div>
    );
  }

  const isOwner = member?.role === "owner";
  const showAuthor = member?.role !== "kid"; // owners + guests see who wrote
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "";

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.journal.title}</h1>

      {/* composer with the daily prompt (guests read only) */}
      {member?.role !== "guest" && (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <p className="mb-2 text-lg font-bold text-amber-900">
          ✏️ {strings.journal.prompt}
        </p>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={strings.journal.placeholder}
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label={strings.journal.mood}>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mood === m}
                onClick={() => setMood(mood === m ? null : m)}
                className={`rounded-full p-1 text-2xl ${
                  mood === m ? "bg-amber-200" : "opacity-60"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label className={`cursor-pointer rounded-xl px-2.5 py-2 text-sm font-semibold ${photo ? "bg-teal-100 text-teal-700" : "bg-white text-slate-600"}`}>
            📷 {photo ? "✓" : strings.journal.addPhoto}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handlePublish()}
          disabled={saving || !body.trim()}
          className="mt-3 w-full rounded-xl bg-teal-600 py-3 font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {strings.journal.publish}
        </button>
      </section>
      )}

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {strings.journal.empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2 text-xs text-slate-400">
                <span>
                  {formatDate(entry.entry_date)}
                  {showAuthor && ` · ${memberName(entry.author_id)}`}
                  {entry.location_name && ` · 📍 ${entry.location_name}`}
                </span>
                {entry.mood && <span className="text-lg">{entry.mood}</span>}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-slate-800">{entry.body}</p>
              <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                {isOwner ? (
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <input
                      type="checkbox"
                      checked={entry.shared_with_guests}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setEntries((prev) =>
                          prev.map((x) =>
                            x.id === entry.id
                              ? { ...x, shared_with_guests: next }
                              : x
                          )
                        );
                        void setJournalShared(entry.id, next).catch(() =>
                          showToast(strings.common.error)
                        );
                      }}
                      className="h-4 w-4 accent-teal-600"
                    />
                    {strings.journal.shareToggle}
                  </label>
                ) : entry.shared_with_guests ? (
                  <span className="text-teal-600">
                    {strings.journal.sharedWithGuests}
                  </span>
                ) : (
                  <span />
                )}
                {(isOwner || entry.author_id === member?.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(strings.journal.deleteConfirm)) return;
                      void deleteJournalEntry(entry.id)
                        .then(() => trip && refresh(trip.id))
                        .catch(() => showToast(strings.common.error));
                    }}
                    className="text-rose-500"
                  >
                    {strings.common.delete}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Toast message={toast} />
    </div>
  );
}
