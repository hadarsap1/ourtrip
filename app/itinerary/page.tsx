import { OwnerOnly } from "@/components/OwnerOnly";
import { ItineraryScreen } from "@/components/itinerary/ItineraryScreen";

export default function ItineraryPage() {
  return (
    <OwnerOnly>
      <ItineraryScreen />
    </OwnerOnly>
  );
}
