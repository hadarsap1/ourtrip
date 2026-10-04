"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import { replayPendingWrites } from "@/lib/offline/queue";
import { markSynced, refreshPendingCount } from "@/lib/offline/status";
import { strings } from "@/lib/strings";
import { isEnabled } from "@/lib/flags";

// Mounted in the root layout: replays the pending-writes queue on app start
// and whenever connectivity returns, with a Hebrew toast when writes synced.
export function OfflineSync() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flash = (text: string) => {
      setMessage(text);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 4000);
    };

    const sync = () => {
      if (!navigator.onLine) return;
      void replayPendingWrites().then(async ({ replayed, dropped, conflicts }) => {
        await refreshPendingCount();
        // Still online after replaying = this device is in step with the server.
        if (navigator.onLine) {
          markSynced();
          if (isEnabled("documentsAutoDownload")) {
            const { prefetchOfflineEssentials } = await import("@/lib/offline/prefetch");
            void prefetchOfflineEssentials();
          }
        }
        // A dropped entry couldn't be saved at all (e.g. its category was
        // removed) - tell the family so they can re-enter it, rather than
        // letting it vanish or block the queue.
        if (dropped > 0) flash(strings.offline.syncFailed);
        else if (conflicts > 0) flash(strings.offline.syncConflict);
        else if (replayed > 0) flash(strings.offline.synced);
      });
    };

    // Re-fire when the app regains focus/visibility too: some mobile browsers
    // don't emit the "online" event reliably when connectivity returns.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <Toast message={message} />;
}
