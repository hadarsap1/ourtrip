"use client";

import Link from "next/link";
import { attentionRows } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { useUnreadWall } from "@/lib/useUnreadWall";

/**
 * "מחכה לך" on the parents' home: approvals, unread chat and new likes and
 * comments, one pill each, each a link straight to it (UX pass 06/11/2026 -
 * it used to be the approvals only, and the rest was a dot on "עוד").
 * Renders nothing when nothing waits, so a quiet day costs no space.
 *
 * Owners only by construction: TodayScreen renders it in the parents' branch,
 * and every count it reads is already scoped by RLS.
 */
export function PendingApprovalsCard({ tripId }: { tripId: string }) {
  const pending = usePendingApprovals(tripId);
  const unread = useUnreadWall();
  const fresh = useNewFeedback(tripId);
  if (!pending) return null;
  const rows = attentionRows(pending, unread, fresh);
  if (rows.length === 0) return null;

  // Pills, not a card of rows (UI pass 15/11/2026): on a busy day the card
  // took the top third of the home before anything about the day itself.
  return (
    <section aria-label={strings.attention.title} className="flex flex-wrap items-center gap-1.5">
      <h2 className="text-xs font-extrabold text-sun-deep">{strings.attention.title}</h2>
      {rows.map((row) => (
        <Link
          key={row.key}
          href={row.href}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-sun-tint ps-3.5 pe-2.5 text-sm font-semibold text-ink active:bg-sun/20"
        >
          {row.label}
          {row.count !== null && (
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-extrabold ${
                row.tone === "waiting" ? "bg-alert text-on-alert" : "bg-surface text-sun-deep"
              }`}
            >
              {row.count}
            </span>
          )}
        </Link>
      ))}
    </section>
  );
}
