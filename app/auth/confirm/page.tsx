import type { Metadata } from "next";
import { ConfirmLinkScreen } from "@/components/auth/ConfirmLinkScreen";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.login };

export default function ConfirmLinkPage() {
  return <ConfirmLinkScreen />;
}
