"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { CameraIcon, PinIcon, TrashIcon } from "@/components/icons";
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
import { formatDate, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import { tripPosition } from "@/lib/tripDay";
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

  const [place, setPlace] = useState<string | null>(null);
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
        const [tripMembers, todayPlace] = await Promise.all([
          listMembers(activeTrip.id),
          getAutoLocation(activeTrip.id).catch(() => null),
        ]);
        if (!cancelled) {
          setMembers(tripMembers);
          setPlace(todayPlace);
        }
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
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const isOwner = member?.role === "owner";
  const showAuthor = member?.role !== "kid"; // owners + guests see who wrote
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? "";

  const today = todayISO();
  const position = tripPosition(trip?.start_date, trip?.end_date, today);
  // Whose voice is already on the page today. The count is the nudge: it says
  // the day is half-written, not that a form is empty.
  const writersToday = new Set(
    entries.filter((e) => e.entry_date === today).map((e) => e.author_id)
  ).size;
  const family = members.filter((m) => m.role !== "guest").length;
  const initial = (id: string) => (memberName(id) || "•").slice(0, 1);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-3 px-4 pt-5 pb-8 sm:max-w-2xl lg:max-w-4xl">
      {/* The place leads, the way a scrapbook page would - logistics sit quiet
          beneath it. Heebo 800 stands in for the display face. */}
      <header>
        <h1 className="text-[28px] font-extrabold leading-none text-ink">
          {place ?? strings.journal.title}
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span dir="ltr">{formatDate(today)}</span>
          {position && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {strings.today.dayOf
                  .replace("{n}", String(position.day))
                  .replace("{total}", String(position.total))}
              </span>
            </>
          )}
        </p>
      </header>

      <hr className="ot-route-divider my-1" />

      <div className="flex items-baseline justify-between gap-2">
        <p className="ot-kicker">{strings.journal.todayEyebrow}</p>
        {family > 0 && (
          <span className="text-[11px] text-ink-soft">
            {strings.journal.wroteCount
              .replace("{n}", String(writersToday))
              .replace("{total}", String(family))}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-line bg-white p-8 text-center text-sm text-ink-faint">
          {strings.journal.empty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-[20px] border border-line bg-white px-3.5 py-3.5"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-full bg-sea-tint text-[12px] font-extrabold text-sea-deep"
                  aria-hidden="true"
                >
                  {initial(entry.author_id)}
                </span>
                <div className="min-w-0 flex-1">
                  {showAuthor && (
                    <p className="truncate text-[13px] font-bold text-ink">
                      {memberName(entry.author_id)}
                    </p>
                  )}
                  <p className="flex items-center gap-1 text-[10.5px] text-ink-soft">
                    <span dir="ltr">{formatDate(entry.entry_date)}</span>
                    {entry.location_name && (
                      <>
                        <PinIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{entry.location_name}</span>
                      </>
                    )}
                  </p>
                </div>
                {entry.mood && (
                  <span className="shrink-0 rounded-full bg-sun-tint px-2 py-0.5 text-[13px] leading-5">
                    {entry.mood}
                  </span>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink [text-wrap:pretty]">
                {entry.body}
              </p>

              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11px] font-bold">
                {isOwner ? (
                  <label className="flex items-center gap-1.5 text-ink-soft">
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
                      className="h-4 w-4 accent-[var(--color-sea)]"
                    />
                    {strings.journal.shareToggle}
                  </label>
                ) : entry.shared_with_guests ? (
                  <span className="text-sea">
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
                    aria-label={strings.common.delete}
                    className="shrink-0 rounded-lg p-1 text-ink-faint hover:text-alert"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Writing is the screen's action, not another card in the stack: the
          composer is pinned to the bottom, within thumb reach, and the author,
          date and location are captured for you. Guests read only. */}
      {member?.role !== "guest" && (
        <section className="mt-auto rounded-[20px] bg-sun-tint px-4 py-4 pt-3.5">
          <p className="text-[17.5px] font-extrabold leading-tight text-sun-deep">
            {strings.journal.prompt}
          </p>
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={strings.journal.placeholder}
            className="mt-2.5 w-full rounded-[13px] border border-sun-deep/20 bg-white/70 px-3 py-2.5 text-base placeholder:text-ink-faint focus:border-sea focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div
              className="flex gap-0.5"
              role="radiogroup"
              aria-label={strings.journal.mood}
            >
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mood === m}
                  onClick={() => setMood(mood === m ? null : m)}
                  className={`rounded-full p-1 text-xl leading-none transition-opacity ${
                    mood === m ? "bg-white/80" : "opacity-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-[11px] px-2.5 py-2 text-[11.5px] font-bold ${
                photo ? "bg-sea-tint text-sea" : "bg-white/70 text-ink-soft"
              }`}
            >
              <CameraIcon className="h-4 w-4" />
              {photo ? strings.journal.photoAttached : strings.journal.addPhoto}
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
            className="mt-2.5 w-full rounded-[13px] bg-sun-deep py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
          >
            {strings.journal.publish}
          </button>
        </section>
      )}

      <Toast message={toast} />
    </div>
  );
}
