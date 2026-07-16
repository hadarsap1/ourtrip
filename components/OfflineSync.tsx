"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import { replayPendingWrites } from "@/lib/offline/queue";
import { strings } from "@/lib/strings";

// Mounted in the root layout: replays the pending-writes queue on app start
// and whenever connectivity returns, with a Hebrew toast when writes synced.
export function OfflineSync() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      if (!navigator.onLine) return;
      void replayPendingWrites().then((replayed) => {
        if (replayed > 0) {
          setMessage(strings.offline.synced);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setMessage(null), 4000);
        }
      });
    };

    sync();
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("online", sync);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <Toast message={message} />;
}
