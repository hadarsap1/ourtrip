"use client";

import { ItineraryScreen } from "@/components/itinerary/ItineraryScreen";
import { KidRouteScreen } from "@/components/itinerary/KidRouteScreen";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

/** Kids get their own read-only route; everyone else the full itinerary. */
export function ItineraryForRole() {
  const { member, memberLoading } = useMember();
  // don't mount the parents' screen (and its reads) on a kid tablet first
  if (!member && memberLoading) {
    return <p className="px-4 pt-8 text-center text-ink-soft">{strings.common.loading}</p>;
  }
  if (member?.role === "kid") return <KidRouteScreen />;
  return <ItineraryScreen />;
}
