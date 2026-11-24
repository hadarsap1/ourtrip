"use client";

import { useRef, useState } from "react";
import { EditIcon, PinIcon, ShareIcon, TrashIcon } from "@/components/icons";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { NewFeedbackChip } from "@/components/feedback/FeedbackCount";
import { ViewersChip } from "@/components/feedback/ViewersChip";
import { useRecordWhenOnScreen } from "@/lib/useRecordView";
import { newFeedback } from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { formatDate } from "@/lib/format";
import { cardHeadline, isScheduled, needsFold } from "@/lib/stories";
import { PhotoCarousel } from "@/components/stories/PhotoCarousel";
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
  // no title: the first line is the headline (Hadar 01/11/2026)
  const { headline, body } = cardHeadline(story);
  // three lines on the card (קרם חם): about 160 characters on a phone
  const folds = needsFold(body, 160, 3);
  const author = members.find((m) => m.id === story.author_id);
  const published = story.status === "approved";
  // the day the entry is about (00078), not the day it went out
  const date = story.entry_date;
  const isOwner = member.role === "owner";
  // a guest sees who wrote it; everyone in the family sees it too
  const showAudience = isOwner;
  // a story for some groups says so to everyone who sees it, like the wall
  // (00063); a family story's groups are only a kid's suggestion - not shown
  const groupsOnly = published && story.visibility === "guests" && story.audience.length > 0;
  // new likes and comments since I last looked (00081); the comments are at
  // the bottom of a long card, so the top says so
  // frozen: the feed marks a card seen as it scrolls by; "חדש" stays for this visit
  const { since } = useFeedbackSeen(true);
  const fresh = newFeedback({ postId: story.id }, comments, reactions, member.id, since(story.id));
  // a guest saw it: half the card on screen for 2 s (00085); parents see who
  const cardRef = useRef<HTMLElement>(null);
  useRecordWhenOnScreen(cardRef, story.id, published);
  const outToGuests = published && story.visibility !== "family";

  return (
    <article
      ref={cardRef}
      id={`story-${story.id}`}
      className="scroll-mt-4 overflow-hidden rounded-[26px] border border-line bg-surface shadow-card"
    >
      {story.photos.length > 0 ? <PhotoCarousel photos={story.photos} cover /> : <div aria-hidden="true" className="ot-gradient h-2" />}
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted">
          {published && (
            <NewFeedbackChip comments={fresh.commentIds.size} likes={fresh.likes} scrollTo={`feedback-${story.id}`} />
          )}
          <span dir="ltr">{formatDate(date)}</span>
          {story.place_label && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true">·</span>
              <PinIcon className="h-3.5 w-3.5" />
              {story.place_label}
            </span>
          )}
          {author && <span>· {author.display_name}</span>}
          {!published && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">
              {story.status === "pending" ? strings.stories.pending : strings.stories.draft}
            </span>
          )}
          {(groupsOnly || (showAudience && published)) && (
            <span className="rounded-full border border-sv-line px-2 py-0.5 font-semibold">
              {groupsOnly
                ? strings.audience.onlyTo.replace("{to}", story.audience.join(", "))
                : AUDIENCE_BADGE[story.visibility]}
            </span>
          )}
          {outToGuests && <ViewersChip target={{ postId: story.id }} members={members} alwaysShow />}
          {published && isScheduled(story) && story.publish_after && (
            <span className="rounded-full bg-sv-sage-soft px-2 py-0.5 font-semibold text-sv-sage">
              {strings.stories.scheduled.replace("{date}", formatDate(story.publish_after.slice(0, 10)))}
            </span>
          )}
        </div>

        {(headline || story.mood) && (
          <div className="flex items-start justify-between gap-2">
            {headline && <h2 className="text-[22px] font-extrabold leading-[1.2] text-ink">{headline}</h2>}
            {story.mood && (
              <span className="ms-auto shrink-0 rounded-full bg-sun-tint px-2 py-0.5 text-base leading-6">
                {story.mood}
              </span>
            )}
          </div>
        )}

        {body && (
          <div>
            <p
              className={`whitespace-pre-wrap text-base leading-[1.45] text-ink [text-wrap:pretty] ${
                folds && !open ? "line-clamp-3" : ""
              }`}
            >
              {body}
            </p>
            {folds && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="mt-1 flex min-h-9 items-center text-base font-bold text-coral underline-offset-4 hover:underline"
              >
                {open ? strings.stories.readLess : strings.stories.readMore}
              </button>
            )}
          </div>
        )}

        {published && (
          <FeedbackBar
            tripId={tripId}
            member={member}
            members={members}
            target={{ postId: story.id }}
            audience={story.visibility === "guests" ? story.audience : []}
            reactions={reactions}
            comments={comments}
            onChanged={onFeedbackChanged}
            onToast={onToast}
          />
        )}

        {(onApprove || onEdit || onDelete || onShare) && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {onApprove && (
              <button
                type="button"
                onClick={onApprove}
                className="me-auto rounded-full bg-green px-4 py-2 text-sm font-bold text-on-green"
              >
                {strings.stories.approve}
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-bold text-ink"
              >
                <ShareIcon className="h-4 w-4" /> {strings.share.whatsapp}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={strings.stories.edit}
                className="grid place-items-center rounded-full border border-line text-muted"
              >
                <EditIcon className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={strings.stories.delete}
                className="grid place-items-center rounded-full border border-line text-muted"
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
