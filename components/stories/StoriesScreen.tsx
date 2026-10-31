"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/Toast";
import { MapIcon, PlusIcon, PrinterIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { SovevScreen } from "@/components/sovev/SovevScreen";
import { SharePrompt } from "@/components/sovev/SharePrompt";
import { StoryCard } from "@/components/stories/StoryCard";
import { StoryComposer } from "@/components/stories/StoryComposer";
import { ApproveStorySheet } from "@/components/stories/ApproveStorySheet";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import { getAutoLocation } from "@/lib/data/journal";
import { deleteStory, listStories, type Story } from "@/lib/data/stories";
import { listComments, listReactions, pollFeedback } from "@/lib/data/feedback";
import { shareText, shareUrl } from "@/lib/share";
import { splitStories, storyHeadline } from "@/lib/stories";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Comment, Member, Reaction, Trip } from "@/lib/types";

/**
 * The journal ("יומן המסע", 00078): what used to be the journal and the
 * stories, one feed. The family writes here with one composer and one
 * question - who sees it; guests read what went out to them, under the map
 * of where we've been. The wall stays apart: it is the conversation.
 */
export function StoriesScreen() {
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [place, setPlace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState<{ story: Story | null } | null>(null);
  const [approving, setApproving] = useState<Story | null>(null);
  const [sharing, setSharing] = useState<{ text: string; url: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrolled = useRef(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const role = member?.role;

  const loadFeedback = useCallback(
    async (tripId: string) => {
      const [r, c] = await Promise.all([
        listReactions(tripId).catch(() => []),
        // kids read comments too, read-only (00050)
        listComments(tripId).catch(() => []),
      ]);
      setReactions(r);
      setComments(c);
    },
    []
  );

  const refresh = useCallback(
    async (tripId: string) => {
      setStories(await listStories(tripId, role));
      await loadFeedback(tripId);
    },
    [role, loadFeedback]
  );

  useEffect(() => {
    if (memberLoading || !member) return;
    let cancelled = false;
    let unsubscribe = () => {};
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        const [tripMembers] = await Promise.all([listMembers(activeTrip.id), refresh(activeTrip.id)]);
        if (!cancelled) setMembers(tripMembers);
        if (member.role !== "guest") {
          const here = await getAutoLocation(activeTrip.id).catch(() => null);
          if (!cancelled) setPlace(here);
        }
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled) return;
      unsubscribe = pollFeedback(() => void loadFeedback(activeTrip.id));
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [member, memberLoading, refresh, loadFeedback, showToast]);

  // a shared link lands on #story-<id>: scroll to it once the feed is in
  useEffect(() => {
    if (loading || scrolled.current) return;
    scrolled.current = true;
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [loading]);

  if (memberLoading || (member && loading)) {
    return (
      <SovevScreen>
        <p className="pt-8 text-center text-sv-ink-soft">{strings.common.loading}</p>
      </SovevScreen>
    );
  }
  if (!member || !trip) {
    return (
      <SovevScreen>
        <p className="px-4 pt-8 text-center text-sv-ink-soft">{strings.common.noMember}</p>
      </SovevScreen>
    );
  }

  const isOwner = role === "owner";
  const isGuest = role === "guest";
  const canWrite = role === "owner" || role === "kid";
  const sections = splitStories(stories, member.id);
  // whose voice is already on today's page: the nudge, as the journal had it
  const today = todayISO();
  const writersToday = new Set(stories.filter((x) => x.entry_date === today).map((x) => x.author_id)).size;
  const family = members.filter((m) => m.role !== "guest" && !m.is_preview).length;
  const roleOf = (id: string) => members.find((m) => m.id === id)?.role;

  const offerShare = (story: Story) => {
    const url = shareUrl(window.location.origin, {
      kind: "story",
      id: story.id,
      publicSlug: story.public_slug,
      isPublic: story.visibility === "public",
    });
    setSharing({ url, text: shareText("story", storyHeadline(story), url) });
  };

  const remove = async (story: Story) => {
    if (!(await askConfirm(strings.stories.deleteConfirm))) return;
    try {
      await deleteStory(story);
      await refresh(trip.id);
    } catch {
      showToast(strings.common.error);
    }
  };

  const card = (story: Story) => {
    // RLS: a kid deletes their own entry while it is open or family-only
    const mineOpen =
      story.author_id === member.id && (story.status !== "approved" || story.visibility === "family");
    return (
      <StoryCard
        key={story.id}
        story={story}
        tripId={trip.id}
        member={member}
        members={members}
        reactions={reactions}
        comments={comments}
        onApprove={isOwner && story.status === "pending" ? () => setApproving(story) : undefined}
        // a kid edits their own story after approval too; it goes back to a
        // parent for approval (posts_guard, 00076)
        onEdit={isOwner || story.author_id === member.id ? () => setComposer({ story }) : undefined}
        onDelete={isOwner || mineOpen ? () => void remove(story) : undefined}
        onShare={
          story.status === "approved" && (role === "guest" || story.visibility !== "family")
            ? () => offerShare(story)
            : undefined
        }
        onFeedbackChanged={() => void loadFeedback(trip.id)}
        onToast={showToast}
      />
    );
  };

  return (
    <SovevScreen>
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5 pb-10 sm:max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{strings.stories.title}</h1>
          {isOwner && (
            <Link
              href="/memory-book"
              aria-label={strings.stories.printBook}
              title={strings.stories.printBook}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sv-line text-sv-ink-soft"
            >
              <PrinterIcon className="h-5 w-5" />
            </Link>
          )}
        </header>

        {/* Guests: where we've been leads, instead of being a place of its own */}
        {isGuest && (
          <Link
            href="/map"
            className="flex items-center gap-3 rounded-[20px] border border-sv-line bg-sv-card px-4 py-3.5 active:bg-sv-sage-soft"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sv-sage-soft text-sv-sage">
              <MapIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-ink">{strings.stories.mapCard}</span>
              <span className="block text-sm text-sv-ink-soft">{strings.stories.mapCardHint}</span>
            </span>
            <span aria-hidden="true" className="text-sv-ink-soft">←</span>
          </Link>
        )}

        {/* The family: today's question is the way in */}
        {canWrite && (
          <button
            type="button"
            onClick={() => setComposer({ story: null })}
            className="block w-full rounded-[20px] bg-sun-tint px-4 py-4 text-start"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[17.5px] font-extrabold leading-tight text-sun-deep">
                {strings.journal.prompt}
              </span>
              {family > 0 && (
                <span className="shrink-0 text-[12px] text-ink-soft">
                  {strings.journal.wroteCount
                    .replace("{n}", String(writersToday))
                    .replace("{total}", String(family))}
                </span>
              )}
            </span>
            <span className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-[13px] bg-sun-deep text-[14px] font-bold text-paper">
              <PlusIcon className="h-4 w-4" /> {strings.stories.newStory}
            </span>
          </button>
        )}

        {sections.pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-sv-clay">{strings.stories.pendingTitle}</h2>
            {sections.pending.map(card)}
          </section>
        )}

        {sections.drafts.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-ink-soft">{strings.stories.draftsTitle}</h2>
            {sections.drafts.map(card)}
          </section>
        )}

        {sections.published.length === 0 ? (
          <p className="rounded-[20px] border border-dashed border-sv-line p-8 text-center text-sv-ink-soft">
            {role === "guest" ? strings.stories.emptyGuest : strings.stories.empty}
          </p>
        ) : (
          <section className="space-y-5">{sections.published.map(card)}</section>
        )}
      </div>

      {composer && (
        <StoryComposer
          trip={trip}
          member={member}
          authorRole={composer.story ? roleOf(composer.story.author_id) : role}
          existing={composer.story}
          initialPlace={place}
          onClose={() => setComposer(null)}
          onSaved={(post, published) => {
            setComposer(null);
            if (!post) return; // queued offline; the composer said so
            void refresh(trip.id).catch(() => {});
            if (!published) {
              showToast(strings.stories.sentForApproval);
              return;
            }
            showToast(post.visibility === "family" ? strings.stories.published : strings.stories.sharedDone);
            if (post.visibility !== "family") {
              const url = shareUrl(window.location.origin, {
                kind: "story",
                id: post.id,
                publicSlug: post.public_slug,
                isPublic: post.visibility === "public",
              });
              setSharing({ url, text: shareText("story", storyHeadline(post), url) });
            }
          }}
          onToast={showToast}
        />
      )}

      {approving && (
        <ApproveStorySheet
          story={approving}
          ownerId={member.id}
          onClose={() => setApproving(null)}
          onDone={(message, published) => {
            const story = approving;
            setApproving(null);
            showToast(message);
            void refresh(trip.id).catch(() => {});
            if (published) offerShare({ ...story, status: "approved", visibility: "guests" });
          }}
          onToast={showToast}
        />
      )}

      {sharing && (
        <SharePrompt text={sharing.text} url={sharing.url} onClose={() => setSharing(null)} onToast={showToast} />
      )}

      <Toast message={toast} />
    </SovevScreen>
  );
}
