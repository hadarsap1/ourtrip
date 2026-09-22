import { Suspense } from "react";
import { OptionsScreen } from "@/components/options/OptionsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.options };

export default function OptionsPage() {
  // OptionsScreen reads the itinerary's per-leg cut (?cc=&leg=) with
  // useSearchParams, which this statically-rendered page has to suspend on.
  return (
    <Suspense>
      <OptionsScreen />
    </Suspense>
  );
}
