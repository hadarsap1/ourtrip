"use client";

import { useSyncExternalStore } from "react";
import { isFriendDevice, isKidDevice, kidDisplayName } from "@/lib/data/kids";

// Whether this device is a registered kid tablet lives in localStorage, which
// the server can't see. Reading it straight from a render body made the server
// HTML ("owner") disagree with the client ("kid"), and React answered a
// hydration mismatch by throwing away the server tree and re-rendering the
// whole shell - a visible stall on exactly the device that can least afford
// it. useSyncExternalStore keeps the first client render matching the server
// and applies the real value right after.
const noopSubscribe = () => () => {};

export function useIsKidDevice(): boolean {
  return useSyncExternalStore(noopSubscribe, isKidDevice, () => false);
}

export function useKidDisplayName(): string | null {
  return useSyncExternalStore(noopSubscribe, kidDisplayName, () => null);
}

/** The role this device's screens assume before the member row arrives: a
 *  family kid's tablet, a friend's (a guest, 00110), or a parent's phone. */
export function useDeviceRole(): "kid" | "guest" | "owner" {
  return useSyncExternalStore(
    noopSubscribe,
    () => (isFriendDevice() ? "guest" : isKidDevice() ? "kid" : "owner"),
    () => "owner" as const
  );
}
