// The four emoji (00045), shared by the big row on an update, episode or
// photo and the small one on a comment or a wall message (00103).

import { strings } from "@/lib/strings";
import type { ReactionKind } from "@/lib/types";

export const LABELS: Record<ReactionKind, string> = {
  heart: strings.feedback.reactionHeart,
  smile: strings.feedback.reactionSmile,
  wow: strings.feedback.reactionWow,
  star: strings.feedback.reactionStar,
};

export function ReactionIcon({ kind, filled }: { kind: ReactionKind; filled: boolean }) {
  // 24px with a heavier stroke: the old 18px / 1.75 icons were thin and small
  // on a phone. Faces get bigger eyes and mouths so they read at a glance.
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const face = (
    <circle cx="12" cy="12" r="9" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.22 : 0} />
  );
  switch (kind) {
    case "heart":
      return (
        <svg {...common} fill={filled ? "currentColor" : "none"}>
          <path d="M12 20.5s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 6.2-8 11-8 11z" />
        </svg>
      );
    case "smile":
      return (
        <svg {...common} fill="none">
          {face}
          <path d="M7.8 13.5a4.6 4.6 0 0 0 8.4 0" />
          <circle cx="9" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "wow":
      return (
        <svg {...common} fill="none">
          {face}
          <ellipse cx="12" cy="15.5" rx="2.2" ry="2.8" />
          <circle cx="9" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} fill={filled ? "currentColor" : "none"}>
          <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z" />
        </svg>
      );
  }
}
