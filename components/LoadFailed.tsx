"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineStatus } from "@/components/OfflineBanner";
import { Button } from "@/components/ui/Button";
import { strings } from "@/lib/strings";

/**
 * In place of a list that did not load. Saying "nothing here yet" then is
 * wrong - the photos or episodes are there, the phone just could not reach
 * them. Says whether the connection is the reason, offers a retry, and
 * retries by itself once requests get through again.
 */
export function LoadFailed({ onRetry }: { onRetry: () => Promise<void> }) {
  const { online } = useOfflineStatus();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const wasOnline = useRef(online);

  const retry = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onRetry]);

  useEffect(() => {
    if (online && !wasOnline.current) void retry();
    wasOnline.current = online;
  }, [online, retry]);

  return (
    <div role="alert" className="space-y-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
      <p className="text-sm text-ink-soft">{online ? strings.offline.loadFailed : strings.offline.loadFailedOffline}</p>
      <Button variant="secondary" loading={busy} onClick={() => void retry()}>
        {strings.common.retry}
      </Button>
    </div>
  );
}
