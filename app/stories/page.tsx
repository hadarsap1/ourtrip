import { StoriesScreen } from "@/components/stories/StoriesScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.stories };

export default function StoriesPage() {
  return <StoriesScreen />;
}
