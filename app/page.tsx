import { TodayScreen } from "@/components/today/TodayScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.today };

export default function TodayPage() {
  return <TodayScreen />;
}
