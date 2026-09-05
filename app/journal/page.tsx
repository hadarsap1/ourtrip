import { JournalScreen } from "@/components/journal/JournalScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.journal };

export default function JournalPage() {
  return <JournalScreen />;
}
