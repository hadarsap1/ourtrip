"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JournalIcon } from "@/components/icons";
import { latestStory } from "@/lib/data/stories";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { MemberRole, Post } from "@/lib/types";

const LAST_VISIT_KEY = "ourtrip.guestHome.lastVisit";

/** When this guest last opened the home, read once and then moved to now.
 *  Per-viewer convenience only: a private window just shows no "new" tag. */
function takeLastVisit(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_VISIT_KEY);
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

type State =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; story: Post | null; photoUrl: string | null; lastVisit: number | null };

/**
 * The newest update, right on the guest home (UX pass 06/11/2026). The home
 * used to be the brand and four doors that repeat the bottom bar, so a friend
 * opening the link from WhatsApp had to tap once more to see anything the
 * family wrote. What a guest may read is decided by RLS in latestStory.
 */
export function GuestLatestUpdate({ tripId, role }: { tripId: string; role: MemberRole }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const lastVisit = takeLastVisit();
    latestStory(tripId, role)
      .then((r) => {
        if (alive) {
          setState({ kind: "ready", story: r?.story ?? null, photoUrl: r?.photoUrl ?? null, lastVisit });
        }
      })
      .catch(() => {
        // offline or refused: the doors below still work, so say nothing here
        if (alive) setState({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [tripId, role]);

  if (state.kind === "failed") return null;
  if (state.kind === "loading") {
    return <div className="h-24 animate-pulse rounded-card bg-sv-sage-soft" aria-busy="true" />;
  }
  const g = strings.guestHome;
  if (!state.story) {
    return (
      <p className="rounded-card border border-dashed border-sv-line bg-sv-card px-4 py-3.5 text-sm text-sv-ink-soft">
        {g.latestEmpty}
      </p>
    );
  }

  const story = state.story;
  const stamp = Date.parse(story.published_at ?? story.created_at);
  const isNew = state.lastVisit !== null && Number.isFinite(stamp) && stamp > state.lastVisit;

  // Photo on top, a headline and two lines under it (06/11/2026: beside a
  // side photo the text ran the whole update and the photo stretched into a
  // strip). The full update is one tap away in the feed.
  return (
    <Link
      href={`/stories#story-${story.id}`}
      className="block overflow-hidden rounded-card border border-sv-line bg-sv-card active:bg-sv-sage-soft"
    >
      {state.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={state.photoUrl} alt="" className="aspect-[16/9] w-full object-cover" />
      )}
      <div className="px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold text-sv-sage">
          {!state.photoUrl && <JournalIcon className="h-4 w-4" />}
          {g.latestTitle}
          {isNew && (
            <span className="rounded-full bg-alert px-2 py-0.5 text-xs font-extrabold text-on-alert">
              {g.latestNew}
            </span>
          )}
        </p>
        <p className="mt-1 line-clamp-2 text-lg font-bold leading-snug text-sv-ink">
          {story.title || g.latestNoTitle}
        </p>
        {story.body && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-sv-ink-soft">{story.body}</p>
        )}
        <p className="mt-2 flex items-center justify-between gap-2 text-xs text-sv-ink-soft">
          <span dir="ltr">{formatDate(story.entry_date)}</span>
          <span className="font-bold text-sv-sage">{g.latestRead} ←</span>
        </p>
      </div>
    </Link>
  );
}
