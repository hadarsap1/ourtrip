import { PocketScreen } from "@/components/pocket/PocketScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.pocket };

export default function PocketPage() {
  return <PocketScreen />;
}
