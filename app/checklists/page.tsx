import { ChecklistsScreen } from "@/components/checklists/ChecklistsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.checklists };

export default function ChecklistsPage() {
  return <ChecklistsScreen />;
}
