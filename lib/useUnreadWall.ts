"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { countUnread, subscribeMessages } from "@/lib/data/messages";
import { getActiveTrip } from "@/lib/data/trip";
import { useMember } from "@/lib/useMember";

/**
 * Unread count for the family wall, used by the kid/guest badge in both the
 * bottom tab bar and the desktop rail. Owners have no badge - they are the ones
 * writing. Recounts on every wall change (debounced) and on navigation, so the
 * badge clears once the wall marks its reads.
 */
export function useUnreadWall() {
  const pathname = usePathname();
  const { member } = useMember();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!member || member.role === "owner") return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const refreshBadge = async () => {
      const trip = await getActiveTrip();
      if (!trip || cancelled) return;
      const count = await countUnread(trip.id, member.id).catch(() => 0);
      if (!cancelled) setUnread(count);
    };

    void refreshBadge();
    const unsubscribe = subscribeMessages(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refreshBadge(), 500);
    });
    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [member, pathname]);

  return unread;
}
