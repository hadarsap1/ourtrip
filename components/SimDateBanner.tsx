"use client";

import { useSyncExternalStore } from "react";
import { getSimDate } from "@/lib/simDate";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";

const noop = () => () => {};

/** Visible whenever a simulated date is active, so it is never mistaken for today. */
export function SimDateBanner() {
  const sim = useSyncExternalStore(noop, getSimDate, () => null);
  if (!sim) return null;
  return (
    <div role="status" className="sticky top-0 z-50 bg-info-soft px-4 py-1.5 text-center text-xs font-bold text-info">
      {strings.simDate.banner.replace("{date}", formatDate(sim))}{" "}
      <a href="?simDate=off" className="underline">
        {strings.simDate.off}
      </a>
    </div>
  );
}
