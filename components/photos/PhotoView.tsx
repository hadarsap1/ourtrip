"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Comment, Member, Reaction } from "@/lib/types";

/** What both the family's and the guests' photo lists can hand over. */
export type ViewedPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  taken_on: string;
  uploaded_by?: string;
  /** the groups it went to, when not everyone (00063) - shown to the family */
  audience?: string[];
};

// A tapped photo as a post: the picture, its whole text, and the likes and
// comments under it (00077). Who may write what is RLS: guests and parents
// comment, kids read; a guest only ever opens a photo that passed rule 3.
export function PhotoView({
  photo,
  tripId,
  member,
  members,
  reactions,
  comments,
  onChanged,
  onToast,
  onClose,
  onChangeDate,
  storyFeedback,
}: {
  photo: ViewedPhoto;
  tripId: string;
  member: Member;
  members: Member[];
  reactions: Reaction[];
  comments: Comment[];
  onChanged: () => void;
  onToast: (message: string) => void;
  onClose: () => void;
  /** Parents only: move the photo to another day, and so its place (00084). */
  onChangeDate?: (date: string) => Promise<void>;
  /** The photo is in an update with likes or comments: they live on the
   *  update, so the sheet links there - the tile said "2 בעדכון" and the
   *  sheet showed nothing (Hadar 06/11/2026). */
  storyFeedback?: ReactNode;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(photo.taken_on);
  const [saving, setSaving] = useState(false);
  const author = photo.uploaded_by ? members.find((m) => m.id === photo.uploaded_by)?.display_name : null;
  return (
    <Sheet open onClose={onClose} title={formatDate(photo.taken_on)}>
      <div className="space-y-3">
        {photo.url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            src={photo.url}
            alt={photo.caption ?? ""}
            className="max-h-[55dvh] w-full rounded-xl bg-paper-deep object-contain"
          />
        )}
        {author && <p className="text-xs font-semibold text-ink-soft">{strings.photos.by.replace("{name}", author)}</p>}
        {onChangeDate && !editingDate && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-soft">{strings.photos.takenOn.replace("{date}", formatDate(photo.taken_on))}</p>
            <button
              type="button"
              onClick={() => {
                setDate(photo.taken_on);
                setEditingDate(true);
              }}
              className="rounded-lg bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft"
            >
              {strings.photos.changeDate}
            </button>
          </div>
        )}
        {onChangeDate && editingDate && (
          <form
            className="space-y-2 rounded-xl border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (saving || !date || date === photo.taken_on) {
                setEditingDate(false);
                return;
              }
              setSaving(true);
              void onChangeDate(date)
                .then(() => setEditingDate(false))
                .finally(() => setSaving(false));
            }}
          >
            <p className="text-xs text-ink-soft">{strings.photos.dateHint}</p>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={strings.photos.changeDate}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink"
            />
            {/* the picker follows the phone's locale; this line is always DD/MM/YYYY */}
            {date && <p className="text-sm font-semibold text-ink">{formatDate(date)}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-sea py-2.5 font-semibold text-on-sea disabled:opacity-60"
              >
                {strings.common.save}
              </button>
              <button
                type="button"
                onClick={() => setEditingDate(false)}
                className="flex-1 rounded-xl border border-line py-2.5 font-semibold text-ink-soft"
              >
                {strings.common.cancel}
              </button>
            </div>
          </form>
        )}
        {photo.caption && (
          <p dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-ink">
            {photo.caption}
          </p>
        )}
        {storyFeedback}
        <FeedbackBar
          tripId={tripId}
          member={member}
          members={members}
          target={{ photoId: photo.id }}
          reactions={reactions}
          comments={comments}
          onChanged={onChanged}
          onToast={onToast}
          audience={photo.audience ?? []}
        />
      </div>
    </Sheet>
  );
}
