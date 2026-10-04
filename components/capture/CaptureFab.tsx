"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { CameraIcon, CoinIcon, EditIcon, PhotosIcon } from "@/components/icons";
import { QuickExpenseSheet } from "./QuickExpenseSheet";
import { isEnabled } from "@/lib/flags";
import { getActiveTrip } from "@/lib/data/trip";
import { createJournalEntryOrQueue, getAutoLocation } from "@/lib/data/journal";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

// Screens where a capture button would be in the way or wrong.
const HIDDEN_ON = ["/login", "/kid-login", "/offline", "/kids", "/guests"];
const noop = () => () => {};

/**
 * 1.7: the capture FAB on every owner screen - expense, note, photo, scan -
 * so any capture is two taps away. Expense and note work offline (both queue).
 */
export function CaptureFab() {
  const pathname = usePathname();
  const router = useRouter();
  const { member } = useMember();
  const enabled = useSyncExternalStore(noop, () => isEnabled("captureFab"), () => false);
  const [sheet, setSheet] = useState<"expense" | "note" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!enabled || member?.role !== "owner" || HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      <Fab
        actions={[
          { key: "expense", label: strings.capture.expense, icon: <CoinIcon className="h-6 w-6" />, onSelect: () => setSheet("expense") },
          { key: "note", label: strings.capture.note, icon: <EditIcon className="h-6 w-6" />, toneClass: "bg-gold/10 text-gold", onSelect: () => setSheet("note") },
          { key: "photo", label: strings.capture.photo, icon: <PhotosIcon className="h-6 w-6" />, toneClass: "bg-cat-shop/10 text-cat-shop", onSelect: () => router.push("/photos?add=1") },
          { key: "scan", label: strings.capture.scan, icon: <CameraIcon className="h-6 w-6" />, toneClass: "bg-cat-flight/10 text-cat-flight", onSelect: () => router.push("/documents?scan=1") },
        ]}
      />
      <QuickExpenseSheet
        open={sheet === "expense"}
        onClose={() => setSheet(null)}
        onDone={(msg) => {
          setSheet(null);
          flash(msg);
        }}
      />
      <NoteSheet
        open={sheet === "note"}
        authorId={member.id}
        onClose={() => setSheet(null)}
        onDone={(msg) => {
          setSheet(null);
          flash(msg);
        }}
      />
      <Toast message={toast} />
    </>
  );
}

/** A quick note becomes a short journal entry for today (queues offline). */
function NoteSheet({ open, authorId, onClose, onDone }: { open: boolean; authorId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const trip = await getActiveTrip();
      if (!trip) throw new Error("no trip");
      const locationName = await getAutoLocation(trip.id).catch(() => null);
      const result = await createJournalEntryOrQueue({ tripId: trip.id, authorId, body: text, mood: null, locationName });
      setText("");
      onDone(result === "queued" ? strings.journal.queued : strings.capture.noteSaved);
    } catch {
      onDone(strings.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={strings.capture.noteTitle}>
      <label className="block">
        <span className="sr-only">{strings.capture.noteTitle}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={strings.capture.notePlaceholder}
          className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-base text-ink"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !text.trim()}
        className="mt-3 w-full rounded-xl bg-sea py-3 text-base font-semibold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft"
      >
        {strings.capture.save}
      </button>
    </Sheet>
  );
}
