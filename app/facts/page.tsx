import { FactsScreen } from "@/components/facts/FactsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.facts };

export default function FactsPage() {
  return <FactsScreen />;
}
