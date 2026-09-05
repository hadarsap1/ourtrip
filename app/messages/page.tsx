import { MessagesScreen } from "@/components/wall/MessagesScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.messages };

export default function MessagesPage() {
  return <MessagesScreen />;
}
