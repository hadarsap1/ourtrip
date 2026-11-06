"use client";

import { useState } from "react";
import Link from "next/link";
import { EditIcon } from "@/components/icons";
import { FeedbackCount } from "@/components/feedback/FeedbackCount";
import { feedbackCounts, newFeedback } from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { formatDate } from "@/lib/format";
import { cardHeadline, needsFold } from "@/lib/stories";
import { strings } from "@/lib/strings";
import type { ViewedPhoto } from "@/components/photos/PhotoView";
import type { PhotoDay } from "@/lib/stories";
import type { Comment, Reaction } from "@/lib/types";

const SHOWN = 6;

/**
 * The day's photos that are in no update, as one card in the updates feed
 * (Hadar 31/10/2026). A tap opens the photo with its likes and comments; the
 * rest of the day is one tap away in the full grid.
 *
 * A photo's text is shown on the card, not only after a tap (Hadar
 * 01/11/2026: "it is not clear there is text with the photo"). One photo:
 * its text under it, the first line as the headline, like an update. Several:
 * each one with text carries a small text mark.
 *
 * Each photo shows its likes and comments, and "new" for what came since I
 * last opened it (Hadar 02/11/2026: "otherwise I open them one by one").
 */
export function PhotoDayCard({
  day,
  memberId,
  comments,
  reactions,
  onOpen,
}: {
  day: PhotoDay<ViewedPhoto>;
  memberId: string;
  comments: Comment[];
  reactions: Reaction[];
  onOpen: (photo: ViewedPhoto) => void;
}) {
  // frozen: the feed marks a card seen as it scrolls by; "חדש" stays for this visit
  const { since } = useFeedbackSeen(true);
  const shown = day.photos.slice(0, SHOWN);
  const hidden = day.photos.length - shown.length;
  const single = day.photos.length === 1 ? day.photos[0] : null;
  const label =
    day.photos.length === 1
      ? strings.stories.photosDayOne
      : strings.stories.photosDay.replace("{n}", String(day.photos.length));

  return (
    <article className="overflow-hidden rounded-card border border-sv-line bg-sv-card">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2.5 text-xs text-sv-ink-soft">
        <span className="font-bold text-ink">{label}</span>
        <span dir="ltr">{formatDate(day.date)}</span>
      </div>
      <ul className={`grid gap-1 px-1 pb-1 ${shown.length === 1 ? "grid-cols-1" : shown.length === 2 || shown.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {shown.map((photo, i) => {
          const last = i === shown.length - 1 && hidden > 0;
          const target = { photoId: photo.id };
          const counts = feedbackCounts(target, comments, reactions);
          const fresh = newFeedback(target, comments, reactions, memberId, since(photo.id));
          return (
            <li key={photo.id} className="relative overflow-hidden rounded-xl bg-paper-deep">
              {last ? (
                <Link href="/photos" className="block" aria-label={strings.stories.allPhotos}>
                  <Thumb photo={photo} single={shown.length === 1} />
                  <span className="absolute inset-0 grid place-items-center bg-ink/45 text-xl font-extrabold text-paper">
                    {strings.stories.morePhotos.replace("{n}", String(hidden + 1))}
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(photo)}
                  aria-label={photo.caption ?? formatDate(photo.taken_on)}
                  className="block w-full"
                >
                  <Thumb photo={photo} single={shown.length === 1} />
                  <span className="absolute top-1.5 start-1.5">
                    <FeedbackCount
                      overlay
                      comments={counts.comments}
                      likes={counts.likes}
                      isNew={fresh.commentIds.size + fresh.likes > 0}
                    />
                  </span>
                  {!single && photo.caption?.trim() && (
                    <span
                      aria-hidden
                      className="absolute bottom-1.5 start-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {single?.caption?.trim() && <CardText text={single.caption} />}
    </article>
  );
}

function Thumb({ photo, single }: { photo: ViewedPhoto; single: boolean }) {
  if (!photo.url) return <div className={single ? "aspect-[4/3]" : "aspect-square"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL
    <img
      src={photo.url}
      alt={photo.caption ?? ""}
      loading="lazy"
      className={`w-full object-cover ${single ? "aspect-[4/3]" : "aspect-square"}`}
    />
  );
}

/** The photo's text: first line as the headline, the rest folded like an update. */
function CardText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { headline, body } = cardHeadline({ title: null, body: text });
  const folds = needsFold(body);
  return (
    <div className="space-y-1.5 px-4 pt-2 pb-4">
      {headline && <h2 className="text-lg font-bold text-ink">{headline}</h2>}
      {body && (
        <div>
          <p
            dir="auto"
            className={`whitespace-pre-wrap text-base leading-[1.7] text-sv-ink [text-wrap:pretty] ${
              folds && !open ? "line-clamp-6" : ""
            }`}
          >
            {body}
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
    </div>
  );
}
