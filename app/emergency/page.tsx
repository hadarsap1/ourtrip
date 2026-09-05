import { EmergencyScreen } from "@/components/emergency/EmergencyScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.emergency };

export default function EmergencyPage() {
  return <EmergencyScreen />;
}
