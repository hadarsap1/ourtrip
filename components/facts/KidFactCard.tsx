"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  destinationForDate,
  listDestinations,
  listFacts,
  pickFactOfDay,
} from "@/lib/data/facts";
import { todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { DestinationFact } from "@/lib/types";

// One fact on the kid home screen, about the place they are in.
//
// It renders NOTHING when there is no fact for today's destination. An empty
// "did you know?" card teaches a kid that the card is usually empty, and then
// they stop looking at it - the same failure the old blank Today screen had.
//
// The fact is chosen by date, not at random, so both kids see the same one on
// the same day and can talk about it.
export function KidFactCard({ tripId }: { tripId: string }) {
  const s = strings.facts;
  const [fact, setFact] = useState<DestinationFact | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const today = todayISO();
        const destinations = await listDestinations(tripId);
        const here = destinationForDate(destinations, today);
        if (!here) return;
        const { facts } = await listFacts(
          tripId,
          here.countryCode,
          here.locationName
        );
        if (!cancelled) setFact(pickFactOfDay(facts, today));
      } catch {
        // Offline with nothing cached, or no trip. The card just stays away.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!fact) return null;

  return (
    <Link
      href="/facts"
      className="block rounded-[20px] border border-line bg-white p-4 active:bg-sea-tint/40"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-sea">
        <span className="text-xl leading-none" aria-hidden="true">
          {fact.emoji ?? "✨"}
        </span>
        {s.kidCardTitle}
      </p>
      <p className="mt-1.5 text-[15.5px] leading-relaxed text-ink">
        {fact.fact}
      </p>
      <p className="mt-1.5 text-sm font-bold text-sea">{s.kidCardMore} ←</p>
    </Link>
  );
}
