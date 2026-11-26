"use client";

import { useRef } from "react";
import { EditIcon, ShareIcon, TrashIcon } from "@/components/icons";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";
import { NewFeedbackChip } from "@/components/feedback/FeedbackCount";
import { ViewersChip } from "@/components/feedback/ViewersChip";
import { useRecordListening } from "@/lib/useRecordView";
import { newFeedback } from "@/lib/feedback";
import { useFeedbackSeen } from "@/lib/useFeedbackSeen";
import { roundMinutes } from "@/lib/audio";
import { formatDate } from "@/lib/format";
import { formatNarrators } from "@/lib/narrators";
import { strings } from "@/lib/strings";
import type { Comment, Episode, Member, Reaction } from "@/lib/types";

export function EpisodeCard({
  episode,
  number,
  url,
  tripId,
  member,
  members,
  reactions,
  comments,
  onApprove,
  onReject,
  onToggleShared,
  onDelete,
  onEdit,
  onShare,
  onFeedbackChanged,
  onToast,
}: {
  episode: Episode;
  number: number | null;
  url: string | null;
  tripId: string;
  member: Member;
  members: Member[];
  reactions: Reaction[];
  comments: Comment[];
  onApprove?: () => void;
  onReject?: () => void;
  onToggleShared?: (shared: boolean) => void;
  onDelete?: () => void;
  /** Parents: trim, cut, add, rename (EpisodeEditor). */
  onEdit?: () => void;
  onShare?: () => void;
  onFeedbackChanged: () => void;
  onToast: (message: string) => void;
}) {
  // who tells it (00079), never whose phone recorded it
  const by = formatNarrators(episode.narrators ?? []);
  const minutes = roundMinutes(episode.duration_seconds);
  const approved = episode.status === "approved";
  // new likes and comments since I last looked (00081)
  // frozen: the feed marks a card seen as it scrolls by; "חדש" stays for this visit
  const { since } = useFeedbackSeen(true);
  const fresh = newFeedback({ episodeId: episode.id }, comments, reactions, member.id, since(episode.id));
  // a guest pressed play, and how far they listened (00085); parents see who
  const audioRef = useRef<HTMLAudioElement>(null);
  useRecordListening(audioRef, episode.id, url);

  return (
    <article
      id={`episode-${episode.id}`}
      className="scroll-mt-4 flex flex-col gap-2.5 rounded-[26px] border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-muted">
        {approved && (
          <NewFeedbackChip comments={fresh.commentIds.size} likes={fresh.likes} scrollTo={`feedback-${episode.id}`} />
        )}
        {number !== null && (
          <span className="font-bold text-coral">{strings.podcast.episodeNo.replace("{n}", String(number))}</span>
        )}
        <span dir="ltr">{formatDate(episode.created_at.slice(0, 10))}</span>
        {minutes !== null && <span>· {strings.podcast.minutes.replace("{n}", String(minutes))}</span>}
        {approved && episode.shared_with_guests && (
          <ViewersChip
            target={{ episodeId: episode.id }}
            members={members}
            alwaysShow
            durationSeconds={episode.duration_seconds}
          />
        )}
        {episode.status === "pending" && (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">
            {strings.stories.pending}
          </span>
        )}
        {episode.status === "rejected" && (
          <span className="rounded-full bg-alert-tint px-2 py-0.5 font-bold text-alert">{strings.podcast.rejected}</span>
        )}
      </div>
      <h2 className="text-[22px] font-extrabold leading-[1.2] text-ink">{episode.title}</h2>
      {by && <p className="text-[15px] text-muted">{strings.podcast.narrators.replace("{names}", by)}</p>}
      {episode.description && (
        <p className="whitespace-pre-wrap text-base leading-[1.45] text-ink">{episode.description}</p>
      )}
      {url ? (
        <AudioPlayer src={url} audioRef={audioRef} durationSeconds={episode.duration_seconds} />
      ) : (
        <p className="text-[13px] text-muted">{strings.podcast.playError}</p>
      )}

      {onApprove && onReject && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onApprove} className="min-h-12 rounded-full bg-green font-bold text-on-green">
            {strings.podcast.approve}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="min-h-12 rounded-full border border-line font-bold text-muted"
          >
            {strings.podcast.reject}
          </button>
        </div>
      )}

      {approved && onToggleShared && (
        <label className="flex items-center gap-2 text-sm font-semibold text-sv-ink">
          <input
            type="checkbox"
            checked={episode.shared_with_guests}
            onChange={(e) => onToggleShared(e.target.checked)}
            className="h-4 w-4 accent-[var(--sv-sage-fill)]"
          />
          {strings.podcast.shareToggle}
        </label>
      )}

      {approved && (
        <FeedbackBar
          tripId={tripId}
          member={member}
          members={members}
          target={{ episodeId: episode.id }}
          reactions={reactions}
          comments={comments}
          onChanged={onFeedbackChanged}
          onToast={onToast}
        />
      )}

      {(onShare || onDelete || onEdit) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink"
            >
              <ShareIcon className="h-4 w-4" /> {strings.share.whatsapp}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink"
            >
              <EditIcon className="h-4 w-4" /> {strings.podcastEdit.open}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={strings.common.delete}
              className="ms-auto grid place-items-center rounded-full border border-line text-muted"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
