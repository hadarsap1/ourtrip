"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { countUnread, subscribeMessages, type WallChange } from "@/lib/data/messages";
import { getActiveTrip } from "@/lib/data/trip";
import { spreadDelay } from "@/lib/realtimeTopic";
import { useMember } from "@/lib/useMember";
import type { Member } from "@/lib/types";

/**
 * Unread count for the family wall, used by the kid/guest badge in the bottom
 * tab bar, the desktop rail and the kids' home tile. Owners have no badge -
 * they are the ones writing. Recounts on navigation, so the badge clears once
 * the wall marks its reads.
 *
 * One module-level store serves every consumer (like useMember): with a hook
 * each, three badges opened three realtime channels and ran three recounts on
 * every message anyone wrote. A new message from someone else bumps the count
 * from the event itself; only other changes (an approval, a delete) recount.
 */

const WALL_PATH = "/messages";

let unread = 0;
const listeners = new Set<() => void>();
let watching: { memberId: string; users: number; stop: () => void } | null = null;
let onWall = false;
let recountTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: number): void {
  if (next === unread) return;
  unread = next;
  for (const notify of listeners) notify();
}

function scheduleRecount(memberId: string, delayMs: number): void {
  if (recountTimer) clearTimeout(recountTimer);
  recountTimer = setTimeout(() => {
    recountTimer = null;
    void (async () => {
      const trip = await getActiveTrip();
      if (!trip || watching?.memberId !== memberId) return;
      const count = await countUnread(trip.id, memberId).catch(() => null);
      if (count !== null && watching?.memberId === memberId) publish(count);
    })();
  }, delayMs);
}

function onChange(memberId: string, change: WallChange): void {
  const row = change.new;
  // RLS already left out what this reader may not see (a kid's pending
  // message, for a guest), so an insert that arrives is one they can open
  if (change.eventType === "INSERT" && row.id && row.sender_id !== memberId && row.approved_at) {
    if (!onWall) publish(unread + 1);
    return;
  }
  scheduleRecount(memberId, spreadDelay(1000));
}

function watch(member: Member): () => void {
  if (watching && watching.memberId !== member.id) {
    watching.stop();
    watching = null;
    publish(0);
  }
  if (!watching) {
    let cancelled = false;
    let unsubscribe = () => {};
    void getActiveTrip().then((trip) => {
      if (!trip || cancelled) return;
      unsubscribe = subscribeMessages(trip.id, (change) => onChange(member.id, change));
    });
    watching = {
      memberId: member.id,
      users: 0,
      stop: () => {
        cancelled = true;
        unsubscribe();
      },
    };
  }
  const mine = watching;
  mine.users += 1;
  return () => {
    mine.users -= 1;
    if (mine.users === 0 && watching === mine) {
      mine.stop();
      watching = null;
    }
  };
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function useUnreadWall() {
  const pathname = usePathname();
  const { member } = useMember();
  const isFamilyReader = Boolean(member && member.role !== "owner");

  useEffect(() => {
    if (!member || member.role === "owner") return;
    return watch(member);
  }, [member]);

  // every consumer runs this on navigation; the shared timer makes it one count
  useEffect(() => {
    onWall = pathname === WALL_PATH || pathname.startsWith(`${WALL_PATH}/`);
    if (!member || member.role === "owner") return;
    scheduleRecount(member.id, 500);
  }, [member, pathname]);

  const count = useSyncExternalStore(subscribe, () => unread, () => 0);
  return isFamilyReader ? count : 0;
}
