import { PhrasebookScreen } from "@/components/phrasebook/PhrasebookScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.phrasebook };

export default function PhrasebookPage() {
  return <PhrasebookScreen />;
}
