import { JarScreen } from "@/components/jar/JarScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.jar };

export default function JarPage() {
  return <JarScreen />;
}
