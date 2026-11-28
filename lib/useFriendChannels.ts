"use client";

import { useCallback, useEffect, useState } from "react";
import { listFriendChannels, type FriendChannel } from "@/lib/data/friends";

/** The caller's friend chats for a home screen: empty when there are none, or
 *  when they cannot be read (the shortcut is then simply left out). Asked again
 *  on return to the app and every minute, for the unread number. */
export function useFriendChannels(enabled: boolean): FriendChannel[] {
  const [channels, setChannels] = useState<FriendChannel[]>([]);
  const load = useCallback(() => {
    void listFriendChannels()
      .then(setChannels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  return enabled ? channels : [];
}
