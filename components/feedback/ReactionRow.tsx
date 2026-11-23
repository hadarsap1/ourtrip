"use client";

import { useState } from "react";
import { LABELS, ReactionIcon } from "@/components/feedback/ReactionIcon";
import { addReaction, removeReaction } from "@/lib/data/feedback";
import { tallyReactions, type FeedbackTarget } from "@/lib/feedback";
import { strings } from "@/lib/strings";
import type { Reaction, ReactionKind } from "@/lib/types";

/**
 * The small emoji row on a comment or a wall message (00103): the same four
 * kinds as on an update, smaller, with a count beside each one given. Tap to
 * give, tap again to take back. Every role may react, kids included - RLS
 * decides what each one can see and react to.
 */
export function ReactionRow({
  tripId,
  memberId,
  target,
  reactions,
  onChanged,
  onToast,
  tone = "plain",
}: {
  tripId: string;
  memberId: string;
  target: FeedbackTarget;
  reactions: Reaction[];
  onChanged: () => void;
  onToast: (message: string) => void;
  /** "onSea" on my own wall bubble, which is dark */
  tone?: "plain" | "onSea";
}) {
  const [busy, setBusy] = useState(false);
  const { tallies } = tallyReactions(reactions, target, memberId);

  async function toggle(kind: ReactionKind, mineId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      if (mineId) await removeReaction(mineId);
      else await addReaction(tripId, memberId, target, kind);
      onChanged();
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  const onSea = tone === "onSea";
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={strings.feedback.reactionsLabel}>
      {tallies.map((t) => {
        const mine = t.mineId !== null;
        const color = mine
          ? onSea
            ? "border-on-sea bg-on-sea/20 text-on-sea"
            : "border-sv-clay bg-sv-clay-soft text-sv-clay"
          : t.count > 0
            ? onSea
              ? "border-on-sea/40 text-on-sea"
              : "border-sv-line text-sv-ink"
            : onSea
              ? "border-transparent text-on-sea/60"
              : "border-transparent text-sv-ink-soft";
        return (
          <button
            key={t.kind}
            type="button"
            onClick={() => void toggle(t.kind, t.mineId)}
            aria-pressed={mine}
            aria-label={`${LABELS[t.kind]}${t.count ? ` (${t.count})` : ""}`}
            className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-1.5 text-xs font-bold active:scale-95 [&>svg]:h-4 [&>svg]:w-4 ${color}`}
          >
            <ReactionIcon kind={t.kind} filled={mine} />
            {t.count > 0 && <span>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
