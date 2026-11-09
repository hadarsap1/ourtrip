"use client";

import { useState } from "react";
import { EyeIcon, PlayIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useContentViews } from "@/lib/useContentViews";
import { useMember } from "@/lib/useMember";
import { formatClock, heardPercent, viewersOf, type ViewTarget } from "@/lib/views";
import type { Member } from "@/lib/types";

const s = strings.views;

/** "09/11/2026 14:05", in the phone's own time. */
function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${formatDate(date)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Parents only: how many guests saw this update or photo, or played this
 * episode (00085), and a tap for who and when - for an episode, how far they
 * listened. Renders nothing for anyone else; RLS gives no one else the rows.
 * `alwaysShow`: the item is out to guests, so "0" is worth saying too.
 */
export function ViewersChip({
  target,
  members,
  alwaysShow = false,
  durationSeconds,
}: {
  target: ViewTarget;
  members: Member[];
  alwaysShow?: boolean;
  durationSeconds?: number | null;
}) {
  const { member } = useMember();
  const isOwner = member?.role === "owner";
  const views = useContentViews(isOwner && member ? member.trip_id : null);
  const [open, setOpen] = useState(false);
  if (!isOwner || !views) return null;

  const episode = "episodeId" in target;
  const viewers = viewersOf(views, target, members);
  if (viewers.length === 0 && !alwaysShow) return null;
  const n = String(viewers.length);
  const Icon = episode ? PlayIcon : EyeIcon;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={(episode ? s.heardLabel : s.seenLabel).replace("{n}", n)}
        className="inline-flex items-center gap-1 rounded-full border border-sv-line px-2 py-0.5 text-xs font-semibold text-sv-ink-soft"
      >
        <Icon className="h-3.5 w-3.5" />
        {(episode ? s.heardCount : s.seenCount).replace("{n}", n)}
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={episode ? s.heardTitle : s.seenTitle}>
          <div className="space-y-3">
            {viewers.length === 0 ? (
              <p className="text-sm text-sv-ink-soft">{episode ? s.noneHeard : s.noneSeen}</p>
            ) : (
              <ul className="divide-y divide-sv-line">
                {viewers.map(({ member: guest, view }) => {
                  const pct = heardPercent(view.heard_seconds, durationSeconds);
                  return (
                    <li key={view.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sv-ink">{guest.display_name}</p>
                        {episode && (
                          <p className="text-xs text-sv-ink-soft">
                            {view.heard_seconds <= 0
                              ? s.justStarted
                              : pct !== null && durationSeconds
                                ? s.heard
                                    .replace("{heard}", formatClock(view.heard_seconds))
                                    .replace("{total}", formatClock(durationSeconds))
                                    .replace("{pct}", String(pct))
                                : s.heardNoTotal.replace("{heard}", formatClock(view.heard_seconds))}
                          </p>
                        )}
                      </div>
                      <span dir="ltr" className="shrink-0 text-xs text-sv-ink-soft">
                        {when(view.last_viewed_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-sv-ink-soft">{episode ? s.guestsOnlyHeard : s.guestsOnly}</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
