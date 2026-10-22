"use client";

import { useState } from "react";
import { EditIcon, PinIcon, ShareIcon, TrashIcon } from "@/components/icons";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { formatDate } from "@/lib/format";
import { isScheduled, needsFold } from "@/lib/stories";
import { strings } from "@/lib/strings";
import type { Story } from "@/lib/data/stories";
import type { Comment, Member, Reaction } from "@/lib/types";

const AUDIENCE_BADGE = {
  family: strings.stories.audienceFamily,
  guests: strings.stories.audienceGuests,
  public: strings.stories.publicBadge,
} as const;

export function StoryCard({
  story,
  tripId,
  member,
  members,
  reactions,
  comments,
  onEdit,
  onDelete,
  onShare,
  onApprove,
  onFeedbackChanged,
  onToast,
}: {
  story: Story;
  tripId: string;
  member: Member;
  members: Member[];
  reactions: Reaction[];
  comments: Comment[];
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onApprove?: () => void;
  onFeedbackChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const folds = needsFold(story.body);
  const author = members.find((m) => m.id === story.author_id);
  const published = story.status === "approved";
  const date = (story.published_at ?? story.created_at).slice(0, 10);
  const isOwner = member.role === "owner";
  // a guest sees who wrote it; everyone in the family sees it too
  const showAudience = isOwner;

  return (
    <article
      id={`story-${story.id}`}
      className="scroll-mt-4 overflow-hidden rounded-[20px] border border-sv-line bg-sv-card"
    >
      {story.photos[0]?.url && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL
        <img
          src={story.photos[0].url}
          alt=""
          className="aspect-[4/3] w-full border-b-2 border-sv-line object-cover"
        />
      )}
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sv-ink-soft">
          <span dir="ltr">{formatDate(date)}</span>
          {story.place_label && (
            <span className="flex items-center gap-1">
              <PinIcon className="h-3 w-3" />
              {story.place_label}
            </span>
          )}
          {author && <span>· {strings.stories.by.replace("{name}", author.display_name)}</span>}
          {!published && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">
              {story.status === "pending" ? strings.stories.pending : strings.stories.draft}
            </span>
          )}
          {showAudience && published && (
            <span className="rounded-full border border-sv-line px-2 py-0.5 font-semibold">
              {story.audience.length > 0
                ? strings.audience.onlyTo.replace("{to}", story.audience.join(", "))
                : AUDIENCE_BADGE[story.visibility]}
            </span>
          )}
          {published && isScheduled(story) && story.publish_after && (
            <span className="rounded-full bg-sv-sage-soft px-2 py-0.5 font-semibold text-sv-sage">
              {strings.stories.scheduled.replace("{date}", formatDate(story.publish_after.slice(0, 10)))}
            </span>
          )}
        </div>

        <h2 className="text-[19px] font-bold leading-7 text-ink">{story.title}</h2>

        {story.body && (
          <div>
            <p
              className={`whitespace-pre-wrap text-[16px] leading-[1.7] text-sv-ink [text-wrap:pretty] ${
                folds && !open ? "line-clamp-6" : ""
              }`}
            >
              {story.body}
            </p>
            {folds && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="mt-1 text-sm font-bold text-sv-clay underline-offset-4 hover:underline"
              >
                {open ? strings.stories.readLess : strings.stories.readMore}
              </button>
            )}
          </div>
        )}

        {story.photos.length > 1 && (
          <ul className="grid grid-cols-2 gap-2">
            {story.photos.slice(1).map((p) =>
              p.url ? (
                <li key={p.photoId} className="overflow-hidden rounded-2xl border border-sv-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                  <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </li>
              ) : null
            )}
          </ul>
        )}

        {published && (
          <FeedbackBar
            tripId={tripId}
            member={member}
            members={members}
            target={{ postId: story.id }}
            reactions={reactions}
            comments={comments}
            onChanged={onFeedbackChanged}
            onToast={onToast}
          />
        )}

        {(onApprove || onEdit || onDelete || onShare) && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sv-line pt-3">
            {onApprove && (
              <button
                type="button"
                onClick={onApprove}
                className="me-auto rounded-xl bg-sea px-4 py-2 text-sm font-bold text-on-sea"
              >
                {strings.stories.approve}
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-1.5 rounded-xl border border-sv-line px-3 py-2 text-sm font-semibold text-sv-ink"
              >
                <ShareIcon className="h-4 w-4" /> {strings.share.whatsapp}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={strings.stories.edit}
                className="grid place-items-center rounded-xl border border-sv-line text-sv-ink-soft"
              >
                <EditIcon className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={strings.stories.delete}
                className="grid place-items-center rounded-xl border border-sv-line text-sv-ink-soft"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
