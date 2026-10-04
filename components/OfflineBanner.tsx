"use client";

import { useSyncExternalStore } from "react";
import { isEnabled } from "@/lib/flags";
import {
  formatLastSynced,
  getOfflineStatus,
  getServerOfflineStatus,
  subscribeOfflineStatus,
  type OfflineStatus,
} from "@/lib/offline/status";
import { strings } from "@/lib/strings";

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getServerOfflineStatus);
}

const noop = () => () => {};

// CLAUDE.md hard rule #6: non-offline-critical screens degrade gracefully
// with a clear Hebrew offline banner. F10 adds "last synced" and the number
// of writes still waiting to go up.
export function OfflineBanner() {
  const { online, lastSyncAt, pending } = useOfflineStatus();
  const v2 = useSyncExternalStore(noop, () => isEnabled("offlineStatus"), () => false);

  if (!v2) {
    if (online) return null;
    return (
      <div role="status" className="offline-banner sticky top-0 z-50 bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning">
        {strings.offline.banner}
      </div>
    );
  }

  if (online && pending === 0) return null;

  const last = formatLastSynced(lastSyncAt);
  const parts = [
    last ? strings.offline.lastSynced.replace("{when}", last) : null,
    pending > 0 ? strings.offline.pending.replace("{n}", String(pending)) : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`offline-banner sticky top-0 z-50 flex items-center gap-3 border-b border-line px-4 py-2 ${
        online ? "bg-info-soft text-info" : "bg-warning-soft text-warning"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {online ? (
          <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4" />
        ) : (
          <path d="M3 3l18 18M8.5 6.3A6 6 0 0 1 18 10a4 4 0 0 1 2.6 6.6M17 19H7.5a4.5 4.5 0 0 1-1.6-8.7" />
        )}
      </svg>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold leading-5">{online ? strings.offline.syncing : strings.offline.bannerV2}</span>
        {parts.length > 0 && <span className="text-xs leading-4">{parts.join(" · ")}</span>}
      </span>
    </div>
  );
}
