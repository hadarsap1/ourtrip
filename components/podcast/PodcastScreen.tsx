"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { askConfirm } from "@/components/ConfirmSheet";
import { SovevScreen } from "@/components/sovev/SovevScreen";
import { SharePrompt } from "@/components/sovev/SharePrompt";
import { EpisodeCard } from "@/components/podcast/EpisodeCard";
import { Recorder, type Take } from "@/components/podcast/Recorder";
import { EpisodeEditor } from "@/components/podcast/EpisodeEditor";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  countQueuedEpisodes,
  deleteEpisode,
  flushQueuedEpisodes,
  listEpisodes,
  setEpisodeShared,
  setEpisodeStatus,
  uploadOrQueueEpisode,
} from "@/lib/data/podcast";
import { episodeUrls } from "@/lib/data/media";
import { listComments, listReactions, subscribeFeedback } from "@/lib/data/feedback";
import { episodeNumbers } from "@/lib/audio";
import { shareText, shareUrl } from "@/lib/share";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Comment, Episode, Member, Reaction, Trip } from "@/lib/types";

export function PodcastScreen() {
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [urls, setUrls] = useState<Map<string, string | null>>(new Map());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [queued, setQueued] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState<{ text: string; url: string } | null>(null);
  const [editing, setEditing] = useState<Episode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrolled = useRef(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const role = member?.role;

  const loadFeedback = useCallback(
    async (tripId: string) => {
      const [r, c] = await Promise.all([
        listReactions(tripId).catch(() => []),
        listComments(tripId).catch(() => []),
      ]);
      setReactions(r);
      setComments(c);
    },
    []
  );

  const refresh = useCallback(
    async (tripId: string) => {
      const list = await listEpisodes(tripId);
      setEpisodes(list);
      const signed = await episodeUrls(role, list.map((e) => e.id)).catch(() => new Map<string, string | null>());
      setUrls(signed);
      setQueued(await countQueuedEpisodes().catch(() => 0));
      await loadFeedback(tripId);
    },
    [role, loadFeedback]
  );

  // recordings that waited on this device go up as soon as there is a signal
  const flush = useCallback(
    async (tripId: string) => {
      if (role !== "owner") return;
      const sent = await flushQueuedEpisodes().catch(() => 0);
      if (sent > 0) {
        showToast(strings.podcast.uploadedQueued.replace("{n}", String(sent)));
        await refresh(tripId);
      }
    },
    [role, refresh, showToast]
  );

  useEffect(() => {
    if (memberLoading || !member) return;
    let cancelled = false;
    let unsubscribe = () => {};
    let onOnline = () => {};
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
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled) return;
      void flush(activeTrip.id);
      onOnline = () => void flush(activeTrip.id);
      window.addEventListener("online", onOnline);
      unsubscribe = subscribeFeedback(activeTrip.id, () => void loadFeedback(activeTrip.id));
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [member, memberLoading, refresh, flush, loadFeedback, showToast]);

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
  // parents record (00049); kids listen and read the comments
  const canRecord = isOwner;
  const numbers = episodeNumbers(episodes);
  const waiting = episodes.filter((e) => e.status !== "approved");
  const live = episodes.filter((e) => e.status === "approved");

  async function save(take: Take, title: string, description: string): Promise<boolean> {
    if (!trip || !member || saving) return false;
    setSaving(true);
    try {
      const result = await uploadOrQueueEpisode({
        tripId: trip.id,
        memberId: member.id,
        isOwner,
        title,
        description: description || null,
        mime: take.mime,
        durationSeconds: take.durationSeconds,
        blob: take.blob,
      });
      if (result === "queued") {
        showToast(strings.podcast.queued);
        setQueued(await countQueuedEpisodes().catch(() => 0));
      } else {
        showToast(strings.podcast.savedOwner);
        await refresh(trip.id);
      }
      return true;
    } catch {
      showToast(strings.common.error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const act = (fn: () => Promise<void>) => () =>
    void fn()
      .then(() => refresh(trip.id))
      .catch(() => showToast(strings.common.error));

  const offerShare = (episode: Episode) => {
    const url = shareUrl(window.location.origin, { kind: "episode", id: episode.id });
    setSharing({ url, text: shareText("episode", episode.title, url) });
  };

  const card = (episode: Episode) => (
    <EpisodeCard
      key={episode.id}
      episode={episode}
      number={numbers.get(episode.id) ?? null}
      url={urls.get(episode.id) ?? null}
      tripId={trip.id}
      member={member}
      members={members}
      reactions={reactions}
      comments={comments}
      onApprove={
        isOwner && episode.status === "pending" ? act(() => setEpisodeStatus(episode.id, "approved", member.id)) : undefined
      }
      onReject={
        isOwner && episode.status === "pending" ? act(() => setEpisodeStatus(episode.id, "rejected", member.id)) : undefined
      }
      onToggleShared={
        isOwner
          ? (shared) => {
              act(() => setEpisodeShared(episode.id, shared))();
              if (shared) offerShare(episode);
            }
          : undefined
      }
      onDelete={
        isOwner
          ? () =>
              void (async () => {
                if (!(await askConfirm(strings.podcast.deleteConfirm))) return;
                act(() => deleteEpisode(episode))();
              })()
          : undefined
      }
      onEdit={isOwner ? () => setEditing(episode) : undefined}
      onShare={
        episode.status === "approved" && (role === "guest" || (isOwner && episode.shared_with_guests))
          ? () => offerShare(episode)
          : undefined
      }
      onFeedbackChanged={() => void loadFeedback(trip.id)}
      onToast={showToast}
    />
  );

  return (
    <SovevScreen>
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5 pb-10 sm:max-w-2xl">
        <header>
          <h1 className="text-2xl font-bold">{strings.podcast.title}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">{strings.podcast.subtitle}</p>
        </header>

        {canRecord && (
          <section className="rounded-[20px] border border-sv-line bg-sv-card p-4">
            <h2 className="mb-3 text-base font-bold text-ink">{strings.podcast.newEpisode}</h2>
            <Recorder busy={saving} onSave={save} />
            {queued > 0 && (
              <p className="mt-3 text-center text-[12px] font-semibold text-sv-clay" role="status">
                {strings.podcast.queuedCount.replace("{n}", String(queued))}
              </p>
            )}
          </section>
        )}

        {waiting.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-sv-clay">{strings.podcast.pendingTitle}</h2>
            {waiting.map(card)}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-bold text-ink">{strings.podcast.episodesTitle}</h2>
          {live.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-sv-line p-8 text-center text-sv-ink-soft">
              {role === "guest" ? strings.podcast.emptyGuest : role === "kid" ? strings.podcast.emptyKid : strings.podcast.empty}
            </p>
          ) : (
            live.map(card)
          )}
        </section>
      </div>

      {editing && (
        <EpisodeEditor
          episode={editing}
          url={urls.get(editing.id) ?? null}
          others={episodes}
          urlOf={(id) => urls.get(id) ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh(trip.id).catch(() => {});
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
