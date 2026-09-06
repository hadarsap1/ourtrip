import { OfflineScreen } from "@/components/OfflineScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.offline };

export default function OfflinePage() {
  return <OfflineScreen />;
}
