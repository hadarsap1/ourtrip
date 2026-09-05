import { ReadyScreen } from "@/components/ready/ReadyScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.ready };

export default function ReadyPage() {
  return <ReadyScreen />;
}
