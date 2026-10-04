import { StatsScreen } from "@/components/stats/StatsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.stats };

export default function StatsPage() {
  return <StatsScreen />;
}
