import { VisasScreen } from "@/components/visas/VisasScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.visas };

export default function VisasPage() {
  return <VisasScreen />;
}
