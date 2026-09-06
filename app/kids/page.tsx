import { KidsAdminScreen } from "@/components/kids/KidsAdminScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.kids };

export default function KidsPage() {
  return <KidsAdminScreen />;
}
