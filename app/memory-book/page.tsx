import { MemoryBookScreen } from "@/components/memory/MemoryBookScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.memoryBook };

export default function MemoryBookPage() {
  return <MemoryBookScreen />;
}
