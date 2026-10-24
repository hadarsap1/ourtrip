import { SettingsScreen } from "@/components/settings/SettingsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.settings };

export default function SettingsPage() {
  return <SettingsScreen />;
}
