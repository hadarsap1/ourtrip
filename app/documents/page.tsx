import { DocumentsScreen } from "@/components/documents/DocumentsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.documents };

export default function DocumentsPage() {
  return <DocumentsScreen />;
}
