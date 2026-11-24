"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { strings } from "@/lib/strings";

/**
 * A screen that threw while rendering. Without this, Next.js replaced the
 * whole app with its own error page, bottom bar included, and only a reload
 * brought it back - which a kid does not know to do. The layout (bar, banners)
 * stays in place; only the broken screen is swapped for this card.
 */
export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div role="alert" className="space-y-4 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">{strings.screenError.title}</h1>
        <p className="text-sm text-ink-soft">{strings.screenError.body}</p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => reset()}>{strings.screenError.retry}</Button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-medium text-sea underline-offset-4 hover:underline"
          >
            {strings.screenError.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
