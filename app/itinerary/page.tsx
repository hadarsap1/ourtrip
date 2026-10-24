import { ItineraryForRole } from "@/components/itinerary/ItineraryForRole";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.itinerary };

export default function ItineraryPage() {
  return <ItineraryForRole />;
}
