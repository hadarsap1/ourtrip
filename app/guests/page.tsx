import { GuestsAdminScreen } from "@/components/guests/GuestsAdminScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.guests };

export default function GuestsPage() {
  return <GuestsAdminScreen />;
}
