import { NotificationsScreen } from "@/components/settings/NotificationsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.notifications };

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
