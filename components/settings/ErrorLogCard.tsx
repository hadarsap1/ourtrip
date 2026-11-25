"use client";

import { useEffect, useState } from "react";
import { clearErrorLog, formatErrorLog, readErrorLog } from "@/lib/offline/errorLog";
import type { ErrorLogEntry } from "@/lib/offline/db";
import { formatDate } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.screenError;

/** The phone's own clock, DD/MM/YYYY HH:MM (the entry is stored in UTC). */
function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Parents only: the render crashes caught on THIS device (app/error.tsx,
 * app/global-error.tsx), newest first, so one that happened on the road with
 * no network can be found later. Read from IndexedDB; nothing is sent. Hidden
 * while the log is empty.
 */
export function ErrorLogCard() {
  const { member } = useMember();
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const isOwner = member?.role === "owner";

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    void readErrorLog().then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (!isOwner || entries.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatErrorLog(entries));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard refused: nothing to do
    }
  }

  async function clear() {
    await clearErrorLog();
    setEntries([]);
  }

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.logTitle}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t.logCount.replace("{n}", String(entries.length))}</p>
      <ul className="mt-2 space-y-2">
        {entries.slice(0, 5).map((e) => (
          <li key={e.id ?? e.at} className="rounded-xl border border-line px-3 py-2 text-xs text-ink">
            <div className="flex flex-wrap items-center gap-x-2 text-ink-soft">
              <span>{when(e.at)}</span>
              <span dir="ltr" className="inline-block">
                {e.path}
              </span>
              {!e.online && <span>{t.logOffline}</span>}
            </div>
            <p dir="ltr" className="mt-1 break-words text-start [unicode-bidi:isolate]">
              {e.message}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-[44px] rounded-xl border border-line bg-surface text-sm font-bold text-ink active:bg-paper-deep"
        >
          {copied ? t.logCopied : t.logCopy}
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          className="min-h-[44px] rounded-xl border border-line bg-surface text-sm font-bold text-ink active:bg-paper-deep"
        >
          {t.logClear}
        </button>
      </div>
    </section>
  );
}
