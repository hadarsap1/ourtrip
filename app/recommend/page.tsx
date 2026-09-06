import { RecommendScreen } from "@/components/recommend/RecommendScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.recommend };

export default function RecommendPage() {
  return <RecommendScreen />;
}
