"use client";

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
}) {
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
        {photo.caption && (
          <p dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-ink">
            {photo.caption}
          </p>
        )}
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
