import { KidLoginScreen } from "@/components/kid/KidLoginScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.kidLogin };

export default function KidLoginPage() {
  return <KidLoginScreen />;
}
