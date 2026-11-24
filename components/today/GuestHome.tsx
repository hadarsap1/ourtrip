"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ComposerLink } from "@/components/ui/Composer";
import { PageHeader } from "@/components/ui/PageHeader";
import { GuestPushInvite } from "@/components/settings/GuestPushCard";
import { HeartIcon } from "@/components/icons";
import { inCountry } from "@/components/today/FamilyClock";
import { addReaction, listReactions, removeReaction } from "@/lib/data/feedback";
import { latestGuestPhotos, type GuestPhoto } from "@/lib/data/guests";
import { listQuotes } from "@/lib/data/jar";
import { listEpisodes } from "@/lib/data/podcast";
import { latestStory, listStoryStamps } from "@/lib/data/stories";
import { listMembers } from "@/lib/data/trip";
import { formatDate } from "@/lib/format";
import { countSince, newLabel, pickQuote, takeLastVisit } from "@/lib/guestVisit";
import { familyClock } from "@/lib/inTrip";
import { kidTagText } from "@/lib/kidTag";
import { strings } from "@/lib/strings";
import type { JarQuote, Member, Post, Reaction } from "@/lib/types";

type Loaded = {
  /** undefined = the update could not be fetched; null = there is none yet */
  story: Post | null | undefined;
  photoUrl: string | null;
  names: Map<string, string>;
  hearts: Reaction[];
  photos: GuestPhoto[];
  quote: JarQuote | null;
  newStories: number;
  newEpisodes: number;
  /** the update or the photos could not be fetched (not "none yet") */
  partial: boolean;
};

/**
 * The guest home as a note from the road, to this person (Hadar 15/11/2026):
 * their name, what is new since they were last here, the newest update with
 * its photo and a heart, the latest photos, one thing the kids said, and a
 * way to answer. It used to be the brand, a fixed illustration and four doors
 * that repeat the bottom bar.
 *
 * Nothing here widens what a guest may see: every read is the guest's own
 * (RLS), the photos come signed from guest-photos (rule 3: approved AND
 * shared), the quote is one a parent shared, and each block that fails to
 * load is simply left out.
 */
export function GuestHome({
  member,
  tripId,
  now,
  countryCode,
  albumFresh,
  unreadWall,
}: {
  member: Member;
  tripId: string | null;
  now: Date;
  countryCode: string | null;
  albumFresh: number;
  unreadWall: number;
}) {
  const g = strings.guestHome;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // bumped by "try again" on the partial-load line
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    // a failed photo read is told apart from "no photos yet" (UX review
    // 24/11/2026): it used to leave a thin page with no word of why
    let photosFailed = false;
    const lastVisit = takeLastVisit();
    void Promise.all([
      latestStory(tripId, "guest").catch(() => undefined),
      listStoryStamps(tripId).catch(() => []),
      listEpisodes(tripId).catch(() => []),
      latestGuestPhotos(4).catch(() => {
        photosFailed = true;
        return [] as GuestPhoto[];
      }),
      listQuotes(tripId).catch(() => [] as JarQuote[]),
      listMembers(tripId).catch(() => [] as Member[]),
      listReactions(tripId).catch(() => [] as Reaction[]),
    ]).then(([latest, stamps, episodes, photos, quotes, members, reactions]) => {
      if (!alive) return;
      const story = latest === undefined ? undefined : (latest?.story ?? null);
      setLoaded({
        story,
        photoUrl: latest?.photoUrl ?? null,
        names: new Map(members.map((m) => [m.id, m.display_name])),
        hearts: story ? reactions.filter((r) => r.post_id === story.id && r.kind === "heart") : [],
        photos: photos.filter((p) => p.url),
        quote: pickQuote(quotes),
        newStories: countSince(stamps.map((s) => s.at), lastVisit),
        newEpisodes: countSince(episodes.map((e) => e.created_at), lastVisit),
        partial: latest === undefined || photosFailed,
      });
    });
    return () => {
      alive = false;
    };
  }, [tripId, attempt]);

  const story = loaded?.story ?? null;
  const mine = loaded?.hearts.find((r) => r.member_id === member.id) ?? null;
  const [hearting, setHearting] = useState(false);
  const toggleHeart = useCallback(async () => {
    if (!tripId || !story || hearting) return;
    setHearting(true);
    try {
      if (mine) await removeReaction(mine.id);
      else await addReaction(tripId, member.id, { postId: story.id }, "heart");
      const all = await listReactions(tripId);
      setLoaded((l) => (l ? { ...l, hearts: all.filter((r) => r.post_id === story.id && r.kind === "heart") } : l));
    } catch {
      // no line: the heart stays as it was, and the feed still has it
    } finally {
      setHearting(false);
    }
  }, [tripId, story, mine, hearting, member.id]);

  const time = familyClock(now, countryCode);
  const fresh = [
    { href: "/stories", label: newLabel(loaded?.newStories ?? 0, g.newStory, g.newStories) },
    { href: "/photos", label: newLabel(albumFresh, g.newPhoto, g.newPhotos) },
    { href: "/podcast", label: newLabel(loaded?.newEpisodes ?? 0, g.newEpisode, g.newEpisodes) },
    { href: "/messages", label: newLabel(unreadWall, g.newMessage, g.newMessages) },
  ].filter((f): f is { href: string; label: string } => f.label !== null);

  const quote = loaded?.quote ?? null;
  const speakers = quote
    ? [...quote.said_by.map((id) => loaded?.names.get(id)).filter((n): n is string => Boolean(n)), ...quote.said_by_other]
    : [];
  const author = story ? loaded?.names.get(story.author_id) : undefined;

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-[18px] pt-[26px] sm:max-w-2xl">
        <PageHeader
          title={g.hello.replace("{name}", member.display_name)}
          subtitle={
            time && countryCode ? (
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-green" />
                <span>
                  {g.theirTime.replace("{where}", inCountry(countryCode))}{" "}
                  <bdi className="tabular-nums">{time}</bdi>
                </span>
              </span>
            ) : undefined
          }
          end={
            // eslint-disable-next-line @next/next/no-img-element -- tiny static brand badge
            <img
              src="/sovev/badge.webp"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full border-2 border-line bg-surface object-cover"
            />
          }
        />

        {fresh.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fresh.map((f, i) => (
              <Link
                key={f.href}
                href={f.href}
                className="inline-flex min-h-[44px] items-center rounded-full bg-green-soft px-4 text-[15px] font-bold text-green"
              >
                {i === 0 ? g.sinceSuffix.replace("{what}", f.label) : f.label}
              </Link>
            ))}
          </div>
        )}

        {loaded === null ? (
          <div className="h-[330px] animate-pulse rounded-[30px] bg-green-soft" aria-busy="true" />
        ) : story ? (
          <article className="ot-hero h-[330px]">
            <Link href={`/stories#story-${story.id}`} className="absolute inset-0 block active:opacity-95">
              {loaded.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img src={loaded.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="ot-scrim absolute inset-x-0 bottom-0 px-5 pb-[18px] pt-[70px]">
                <p className="text-[13px] font-bold text-[#ffd6a8]">
                  {[author ? g.by.replace("{name}", author) : null, story.place_label, formatDate(story.entry_date)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <h2 className="mb-1.5 mt-1 line-clamp-2 text-[28px] font-extrabold leading-[1.15] text-white">
                  {story.title || g.latestNoTitle}
                </h2>
                {story.body && <p className="line-clamp-2 text-base leading-snug text-[#eef2ef]">{story.body}</p>}
              </div>
            </Link>
            {/* the heart stays on the card, above the link (it is not part of it) */}
            <button
              type="button"
              onClick={() => void toggleHeart()}
              disabled={hearting}
              aria-pressed={mine !== null}
              aria-label={mine ? g.hearted : g.heart}
              className={`absolute end-3 top-3 inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold shadow-card ${
                mine ? "bg-coral-soft text-coral" : "bg-surface/90 text-ink"
              }`}
            >
              <HeartIcon className="h-5 w-5" fill={mine ? "currentColor" : "none"} />
              {loaded.hearts.length > 0 && <span className="tabular-nums">{loaded.hearts.length}</span>}
            </button>
          </article>
        ) : story === null && loaded.story === null ? (
          // nothing shared yet: the family on the path, and a line in our own voice
          <div className="overflow-hidden rounded-[30px] border border-line bg-surface shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand illustration */}
            <img src="/sovev/scene.webp" alt="" className="aspect-[2/1] w-full object-cover" />
            <div className="px-5 py-4">
              <p className="text-[22px] font-extrabold leading-tight text-ink">{g.emptyTitle}</p>
              <p className="mt-1 text-[15px] text-muted">{g.emptyBody}</p>
            </div>
          </div>
        ) : null}

        {loaded?.partial && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-card border border-dashed border-line bg-surface px-4 py-2">
            <p className="text-sm text-muted">{g.partialLoad}</p>
            <button
              type="button"
              onClick={() => {
                // the last visit was already taken on the first load; the
                // "since you were here" counts stay as they were
                setLoaded(null);
                setAttempt((n) => n + 1);
              }}
              className="min-h-11 shrink-0 px-2 text-sm font-bold text-green"
            >
              {strings.common.retry}
            </button>
          </div>
        )}

        <GuestPushInvite />

        {loaded && loaded.photos.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-ink">{g.photosTitle}</h2>
              <Link href="/photos" className="inline-flex min-h-8 items-center text-[15px] font-bold text-green">
                {g.photosAll} ←
              </Link>
            </div>
            <Link href="/photos" className="grid grid-cols-4 gap-2">
              {loaded.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img
                  key={p.id}
                  src={p.thumbUrl ?? p.url ?? ""}
                  alt={p.caption ?? ""}
                  className="aspect-square w-full rounded-2xl bg-green-soft object-cover"
                />
              ))}
            </Link>
          </section>
        )}

        {/* the quiet row: the jar and "whose parents are you" */}
        {quote ? (
          <Link href="/jar" className="block rounded-[20px] border border-line bg-surface px-4 py-3 shadow-card active:opacity-90">
            <p className="text-[13px] font-bold text-muted">{g.quoteTitle}</p>
            <p className="mt-1 line-clamp-3 text-lg font-medium leading-snug text-ink">״{quote.quote}״</p>
            {speakers.length > 0 && <p className="mt-1 text-sm font-medium text-muted">{speakers.join(", ")}</p>}
          </Link>
        ) : (
          loaded && (
            // the jar has no tab for guests: without a quote this is the way in
            <Link
              href="/jar"
              className="flex min-h-11 items-center justify-between gap-2 px-1 text-[15px] font-medium text-muted"
            >
              <span>{g.jarTile}</span>
              <span className="shrink-0 font-bold text-green">{g.jarOpen} ←</span>
            </Link>
          )
        )}

        <Link
          href="/settings"
          className="flex min-h-[44px] items-center justify-center gap-2 text-sm font-medium text-green"
        >
          {(member.kid_names ?? []).length > 0 ? (
            <>
              <span className="min-w-0 truncate text-muted">{kidTagText(member.kid_names)}</span>
              <span className="shrink-0 underline">{strings.kidTag.homeEdit}</span>
            </>
          ) : (
            <span className="underline">{strings.kidTag.homeAdd}</span>
          )}
        </Link>

        {/* rides just above the bottom bar while the page scrolls (N1) */}
        <div className="sticky bottom-[calc(100px+env(safe-area-inset-bottom))] z-10 pb-1 lg:bottom-4">
          <ComposerLink href="/messages" label={g.writeUs} cta={g.writeUsCta} />
        </div>
      </div>
    </div>
  );
}
