"use client";

import { useEffect, useState } from "react";
import { strings } from "@/lib/strings";

// CLAUDE.md hard rule #6: non-offline-critical screens degrade gracefully
// with a clear Hebrew offline banner.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      {strings.offline.banner}
    </div>
  );
}
