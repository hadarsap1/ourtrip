import { MapScreen } from "@/components/map/MapScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.map };

export default function MapPage() {
  return <MapScreen />;
}
