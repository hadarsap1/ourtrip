import { PhotosScreen } from "@/components/photos/PhotosScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.photos };

export default function PhotosPage() {
  return <PhotosScreen />;
}
