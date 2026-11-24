"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SovevScreen } from "@/components/sovev/SovevScreen";
import { GuestPushInvite } from "@/components/settings/GuestPushCard";
import { HeartIcon } from "@/components/icons";
import { inCountry } from "@/components/today/FamilyClock";
import { flagEmoji } from "@/lib/data/countryProfile";
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
    <SovevScreen>
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-5 pb-8 sm:max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="sovev-display text-3xl leading-9 text-sv-ink">
              {g.hello.replace("{name}", member.display_name)}
            </h1>
            {time && countryCode && (
              <p className="mt-0.5 text-sm text-sv-ink-soft">
                <span aria-hidden="true">{flagEmoji(countryCode)} </span>
                {g.familyTime.replace("{where}", inCountry(countryCode))}{" "}
                <bdi className="font-bold tabular-nums text-sv-ink">{time}</bdi>
              </p>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand badge */}
          <img
            src="/sovev/badge.webp"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-full border-2 border-sv-ink object-cover"
          />
        </header>

        {fresh.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-sv-ink-soft">{g.sinceTitle}</span>
            {fresh.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="inline-flex min-h-[44px] items-center rounded-full bg-sv-sage-soft px-3 text-sm font-bold text-sv-sage"
              >
                {f.label}
              </Link>
            ))}
          </div>
        )}

        {loaded === null ? (
          <div className="h-64 animate-pulse rounded-card bg-sv-sage-soft" aria-busy="true" />
        ) : story ? (
          <article className="overflow-hidden rounded-card bg-sv-card shadow-card">
            <Link href={`/stories#story-${story.id}`} className="block active:opacity-90">
              {loaded.photoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                  <img src={loaded.photoUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
                    <h2 className="line-clamp-2 text-xl font-bold leading-snug text-white">
                      {story.title || g.latestNoTitle}
                    </h2>
                  </div>
                </div>
              ) : (
                <h2 className="line-clamp-2 px-4 pt-4 text-xl font-bold leading-snug text-sv-ink">
                  {story.title || g.latestNoTitle}
                </h2>
              )}
              <div className="px-4 pt-2.5">
                <p className="text-xs text-sv-ink-soft">
                  {[author ? g.by.replace("{name}", author) : null, story.place_label, formatDate(story.entry_date)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {story.body && (
                  <p className="mt-1.5 line-clamp-3 text-base leading-relaxed text-sv-ink">{story.body}</p>
                )}
              </div>
            </Link>
            <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-1">
              <button
                type="button"
                onClick={() => void toggleHeart()}
                disabled={hearting}
                aria-pressed={mine !== null}
                aria-label={mine ? g.hearted : g.heart}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold ${
                  mine ? "text-alert" : "text-sv-ink-soft"
                }`}
              >
                <HeartIcon className="h-5 w-5" fill={mine ? "currentColor" : "none"} />
                {loaded.hearts.length > 0 && <span className="tabular-nums">{loaded.hearts.length}</span>}
              </button>
              <Link
                href={`/stories#story-${story.id}`}
                className="inline-flex min-h-11 items-center px-2.5 text-sm font-bold text-sv-sage"
              >
                {g.latestRead} ←
              </Link>
            </div>
          </article>
        ) : story === null && loaded.story === null ? (
          // nothing shared yet: the family on the path, and a line in our own voice
          <div className="overflow-hidden rounded-card border border-sv-line bg-sv-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand illustration */}
            <img src="/sovev/scene.webp" alt="" className="aspect-[2/1] w-full object-cover" />
            <div className="px-4 py-3.5">
              <p className="sovev-display text-xl text-sv-ink">{g.emptyTitle}</p>
              <p className="mt-0.5 text-sm text-sv-ink-soft">{g.emptyBody}</p>
            </div>
          </div>
        ) : null}

        {loaded?.partial && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-card border border-dashed border-sv-line bg-sv-card px-4 py-2">
            <p className="text-sm text-sv-ink-soft">{g.partialLoad}</p>
            <button
              type="button"
              onClick={() => {
                // the last visit was already taken on the first load; the
                // "since you were here" counts stay as they were
                setLoaded(null);
                setAttempt((n) => n + 1);
              }}
              className="min-h-11 shrink-0 px-2 text-sm font-bold text-sv-sage"
            >
              {strings.common.retry}
            </button>
          </div>
        )}

        <GuestPushInvite />

        {loaded && loaded.photos.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="ot-kicker">{g.photosTitle}</h2>
              <Link href="/photos" className="inline-flex items-center text-sm font-bold text-sv-sage">
                {g.photosAll} ←
              </Link>
            </div>
            <Link href="/photos" className="grid grid-cols-4 gap-2">
              {loaded.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img
                  key={p.id}
                  src={p.thumbUrl ?? p.url ?? ""}
                  alt={p.caption ?? ""}
                  className="aspect-square w-full rounded-md border-[3px] border-white object-cover shadow-card"
                  style={{ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` }}
                />
              ))}
            </Link>
          </section>
        )}

        {quote ? (
          <Link href="/jar" className="block rounded-card bg-sun-tint px-4 py-3 active:opacity-90">
            <p className="text-xs font-bold text-sun-deep">{g.quoteTitle}</p>
            <p className="sovev-display mt-1 line-clamp-3 text-2xl leading-8 text-sv-ink">״{quote.quote}״</p>
            {speakers.length > 0 && <p className="mt-1 text-sm font-semibold text-sun-deep">{speakers.join(", ")}</p>}
          </Link>
        ) : (
          loaded && (
            // the jar has no tab for guests: without a quote this is the way in
            <Link
              href="/jar"
              className="flex min-h-11 items-center justify-between gap-2 rounded-card bg-sun-tint px-4 py-2 text-sm font-bold text-sun-deep active:opacity-90"
            >
              <span>{g.jarTile}</span>
              <span className="shrink-0">{g.jarOpen} ←</span>
            </Link>
          )
        )}

        <Link
          href="/messages"
          className="flex min-h-[48px] items-center justify-between gap-3 rounded-full border border-sv-line bg-sv-card py-1.5 pe-1.5 ps-4"
        >
          <span className="text-base text-sv-ink-soft">{g.writeUs}</span>
          <span className="rounded-full bg-sv-sage-fill px-4 py-2 text-sm font-bold text-white">{g.writeUsCta}</span>
        </Link>

        <Link
          href="/settings"
          className="flex min-h-[44px] items-center justify-center gap-2 text-sm font-semibold text-sv-sage"
        >
          {(member.kid_names ?? []).length > 0 ? (
            <>
              <span className="min-w-0 truncate text-sv-ink-soft">{kidTagText(member.kid_names)}</span>
              <span className="shrink-0 underline">{strings.kidTag.homeEdit}</span>
            </>
          ) : (
            <span className="underline">{strings.kidTag.homeAdd}</span>
          )}
        </Link>
      </div>
    </SovevScreen>
  );
}
