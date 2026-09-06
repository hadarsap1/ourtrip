import { OptionsScreen } from "@/components/options/OptionsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.options };

export default function OptionsPage() {
  return <OptionsScreen />;
}
