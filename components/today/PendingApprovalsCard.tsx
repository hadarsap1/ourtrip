"use client";

import Link from "next/link";
import { ChevronForwardIcon } from "@/components/icons";
import { attentionRows } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { useNewFeedback } from "@/lib/useNewFeedback";
import { usePendingApprovals } from "@/lib/usePendingApprovals";
import { useUnreadWall } from "@/lib/useUnreadWall";

/**
 * "מחכה לך" on the parents' home: approvals, unread chat and new likes and
 * comments, one row each, each a link straight to it (UX pass 06/11/2026 -
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

  return (
    <section className="overflow-hidden rounded-[18px] border border-sun/40 bg-sun-tint">
      <h2 className="px-3.5 pt-3 pb-1.5 text-[13.5px] font-extrabold text-sun-deep">
        {strings.attention.title}
      </h2>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="border-t border-sun/25">
            <Link href={row.href} className="flex min-h-[44px] items-center gap-2 px-3.5 py-2.5 active:bg-sun/10">
              <span className="flex-1 text-[13.5px] font-semibold text-ink">
                {row.label}
                {row.tone === "waiting" && (
                  <span className="ms-1.5 text-[12px] font-medium text-sun-deep">
                    · {strings.attention.waitingLabel}
                  </span>
                )}
              </span>
              {row.count !== null && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold ${
                    row.tone === "waiting" ? "bg-rose-500 text-white" : "bg-surface text-sun-deep"
                  }`}
                >
                  {row.count}
                </span>
              )}
              <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-sun-deep/60" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
