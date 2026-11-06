"use client";

import { useEffect, useState } from "react";
import { NO_PENDING, type PendingApprovals } from "@/lib/approvals";
import { loadPendingApprovals } from "@/lib/data/pendingApprovals";

/**
 * The parent's approval counts, reloaded whenever the app comes back to the
 * foreground - opening the app from a push notification lands on fresh
 * numbers. null while loading or when tripId is null (not a parent).
 * refreshKey (the pathname, for the bottom bar) reloads when it changes, so
 * the "עוד" dot clears once the parent has approved and moved on.
 */
export function usePendingApprovals(
  tripId: string | null,
  refreshKey?: string
): PendingApprovals | null {
  const [pending, setPending] = useState<PendingApprovals | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const load = () => {
      void loadPendingApprovals(tripId)
        .then((p) => {
          if (!cancelled) setPending(p);
        })
        .catch(() => {
          if (!cancelled) setPending(NO_PENDING);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tripId, refreshKey]);

  return tripId ? pending : null;
}
