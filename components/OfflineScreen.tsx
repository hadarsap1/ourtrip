"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  ChevronForwardIcon,
  DocumentIcon,
  HomeIcon,
  type IconProps,
  PhrasebookIcon,
  WarningIcon,
} from "@/components/icons";
import { strings } from "@/lib/strings";

// The service worker serves this route when a screen that was never cached is
// opened with no connection. A dead end would be worse than useless on the
// road, so it lists the screens that CLAUDE.md rule #6 guarantees offline.
const LIFELINES: { href: string; label: string; Icon: ComponentType<IconProps> }[] =
  [
    { href: "/", label: strings.offlinePage.today, Icon: HomeIcon },
    {
      href: "/documents",
      label: strings.offlinePage.documents,
      Icon: DocumentIcon,
    },
    {
      href: "/emergency",
      label: strings.offlinePage.emergency,
      Icon: WarningIcon,
    },
    {
      href: "/phrasebook",
      label: strings.offlinePage.phrasebook,
      Icon: PhrasebookIcon,
    },
  ];

export function OfflineScreen() {
  const s = strings.offlinePage;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-10 pb-8">
      <header className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sun-tint text-sun-deep">
          <WarningIcon className="h-6 w-6" strokeWidth={1.7} />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-ink">{s.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
      </header>

      <ul className="overflow-hidden rounded-[18px] border border-line bg-white">
        {LIFELINES.map((row, i) => (
          <li key={row.href} className={i > 0 ? "border-t border-line" : ""}>
            <Link
              href={row.href}
              className="flex items-center gap-3 px-3.5 py-3 active:bg-paper-deep"
            >
              <row.Icon
                className="h-[18px] w-[18px] shrink-0 text-sea"
                strokeWidth={1.7}
              />
              <span className="flex-1 text-[13.5px] font-medium text-ink">
                {row.label}
              </span>
              <ChevronForwardIcon className="h-3.5 w-3.5 shrink-0 text-line" />
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full rounded-2xl border border-line bg-white py-3 text-sm font-medium text-ink-soft active:bg-paper-deep"
      >
        {s.retry}
      </button>
    </div>
  );
}
