"use client";

import Link from "next/link";
import { ChevronForwardIcon } from "@/components/icons";
import { pendingRows, totalPending } from "@/lib/approvals";
import { strings } from "@/lib/strings";
import { usePendingApprovals } from "@/lib/usePendingApprovals";

/**
 * "Waiting for you" on the parents' home: one row per screen with something to
 * approve, each a link straight to it. Renders nothing when nothing waits, so
 * an empty queue costs no space.
 */
export function PendingApprovalsCard({ tripId }: { tripId: string }) {
  const pending = usePendingApprovals(tripId);
  if (!pending || totalPending(pending) === 0) return null;

  return (
    <section className="overflow-hidden rounded-[18px] border border-sun/40 bg-sun-tint">
      <h2 className="px-3.5 pt-3 pb-1.5 text-[13.5px] font-extrabold text-sun-deep">
        {strings.approvals.title.replace("{n}", String(totalPending(pending)))}
      </h2>
      <ul>
        {pendingRows(pending).map((row) => (
          <li key={row.key} className="border-t border-sun/25">
            <Link href={row.href} className="flex items-center gap-2 px-3.5 py-2.5 active:bg-sun/10">
              <span className="flex-1 text-[13.5px] font-semibold text-ink">{row.label}</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[12px] font-extrabold text-white">
                {row.count}
              </span>
              <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-sun-deep/60" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
