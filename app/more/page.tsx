import { MoreScreen } from "@/components/more/MoreScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.more };

export default function MorePage() {
  return <MoreScreen />;
}
