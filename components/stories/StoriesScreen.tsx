"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { PlusIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { SovevScreen } from "@/components/sovev/SovevScreen";
import { SharePrompt } from "@/components/sovev/SharePrompt";
import { StoryCard } from "@/components/stories/StoryCard";
import { StoryComposer } from "@/components/stories/StoryComposer";
import { ApproveStorySheet } from "@/components/stories/ApproveStorySheet";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import { getAutoLocation } from "@/lib/data/journal";
import { deleteStory, listStories, type Story } from "@/lib/data/stories";
import { listComments, listReactions, subscribeFeedback } from "@/lib/data/feedback";
import { shareText, shareUrl } from "@/lib/share";
import { splitStories } from "@/lib/stories";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Comment, Member, Reaction, Trip } from "@/lib/types";

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
      unsubscribe = subscribeFeedback(activeTrip.id, () => void loadFeedback(activeTrip.id));
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
  const canWrite = role === "owner" || role === "kid";
  const sections = splitStories(stories, member.id);
  const roleOf = (id: string) => members.find((m) => m.id === id)?.role;

  const offerShare = (story: Story) => {
    const url = shareUrl(window.location.origin, {
      kind: "story",
      id: story.id,
      publicSlug: story.public_slug,
      isPublic: story.visibility === "public",
    });
    setSharing({ url, text: shareText("story", story.title, url) });
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
    const mineOpen = story.author_id === member.id && story.status !== "approved";
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
        onEdit={isOwner || mineOpen ? () => setComposer({ story }) : undefined}
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
          {canWrite && (
            <button
              type="button"
              onClick={() => setComposer({ story: null })}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-sea px-4 font-bold text-on-sea"
            >
              <PlusIcon className="h-4 w-4" /> {strings.stories.newStory}
            </button>
          )}
        </header>

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
            void refresh(trip.id).catch(() => {});
            if (!published) {
              showToast(post.status === "pending" ? strings.stories.sentForApproval : strings.stories.draftSaved);
              return;
            }
            showToast(strings.stories.published);
            if (post.visibility !== "family") {
              const url = shareUrl(window.location.origin, {
                kind: "story",
                id: post.id,
                publicSlug: post.public_slug,
                isPublic: post.visibility === "public",
              });
              setSharing({ url, text: shareText("story", post.title, url) });
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
