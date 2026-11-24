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
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={strings.feedback.reactionsLabel}>
      {tallies.map((t) => {
        const mine = t.mineId !== null;
        const color = mine
          ? onSea
            ? "border-on-sea bg-on-sea/20 text-on-sea"
            : "border-coral bg-coral-soft text-coral-ink"
          : t.count > 0
            ? onSea
              ? "border-on-sea/40 text-on-sea"
              : "border-line text-ink"
            : onSea
              ? "border-transparent text-on-sea/60"
              : "border-transparent text-muted";
        return (
          <button
            key={t.kind}
            type="button"
            onClick={() => void toggle(t.kind, t.mineId)}
            aria-pressed={mine}
            aria-label={`${LABELS[t.kind]}${t.count ? ` (${t.count})` : ""}`}
            // compact (קרם חם chat): 40px visual, the global floor makes the box 44
            className={`flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border px-2 text-[15px] font-bold motion-safe:active:scale-95 [&_svg]:h-5 [&_svg]:w-5 ${color}`}
          >
            {t.count > 0 && <span>{t.count}</span>}
            <span className={mine && !onSea ? "text-coral" : ""}>
              <ReactionIcon kind={t.kind} filled={mine} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
