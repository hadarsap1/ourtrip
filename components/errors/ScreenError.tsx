"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DocumentIcon, HomeIcon, PhrasebookIcon, WarningIcon } from "@/components/icons";
import { logRenderError } from "@/lib/offline/errorLog";
import { strings } from "@/lib/strings";

// What app/error.tsx (inside the app shell) and app/global-error.tsx (the
// shell itself broke) show instead of a blank screen. The crash is written
// quietly to the device's error log (lib/offline/errorLog.ts), never sent.
// Links are plain <a> in the root case: the router may be what failed.

const LIFELINES = [
  { href: "/emergency", label: strings.offlinePage.emergency, Icon: WarningIcon },
  { href: "/documents", label: strings.offlinePage.documents, Icon: DocumentIcon },
  { href: "/phrasebook", label: strings.offlinePage.phrasebook, Icon: PhrasebookIcon },
];

export function ScreenError({
  error,
  reset,
  boundary,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  boundary: "screen" | "root";
}) {
  const s = strings.screenError;

  useEffect(() => {
    void logRenderError(error, boundary);
  }, [error, boundary]);

  const row = "flex min-h-[44px] items-center gap-3 px-3.5 py-3 active:bg-paper-deep";
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 px-4 pt-10 pb-8">
      <header className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sun-tint text-sun-deep">
          <WarningIcon className="h-6 w-6" strokeWidth={1.7} />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-ink">{s.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
      </header>

      <button
        type="button"
        onClick={reset}
        className="min-h-[48px] w-full rounded-xl bg-sea py-3 text-base font-semibold text-on-sea active:bg-sea-deep"
      >
        {s.retry}
      </button>

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {LIFELINES.map((l, i) => (
          <li key={l.href} className={i > 0 ? "border-t border-line" : ""}>
            {boundary === "root" ? (
              <a href={l.href} className={row}>
                <l.Icon className="h-[18px] w-[18px] shrink-0 text-sea" strokeWidth={1.7} />
                <span className="flex-1 text-sm font-medium text-ink">{l.label}</span>
              </a>
            ) : (
              <Link href={l.href} className={row}>
                <l.Icon className="h-[18px] w-[18px] shrink-0 text-sea" strokeWidth={1.7} />
                <span className="flex-1 text-sm font-medium text-ink">{l.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {/* a full load on purpose: whatever state broke the screen goes with it */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-sm font-medium text-ink active:bg-paper-deep"
      >
        <HomeIcon className="h-4 w-4" strokeWidth={1.7} />
        {s.home}
      </a>
    </div>
  );
}
