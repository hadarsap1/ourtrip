import { PodcastScreen } from "@/components/podcast/PodcastScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.podcast };

export default function PodcastPage() {
  return <PodcastScreen />;
}
