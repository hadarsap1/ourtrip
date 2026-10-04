import { strings } from "@/lib/strings";

/** One grey block. Static: at most one animated element per screen (design rule). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block rounded-lg bg-paper-deep ${className}`} />;
}

type Variant = "today" | "list" | "cards";

/**
 * Route-level loading state (F9). Shown only while there is no cached data
 * yet; with a cache the screen renders that first and refreshes silently.
 */
export function ScreenSkeleton({ variant = "list" }: { variant?: Variant }) {
  return (
    <div role="status" aria-busy="true" aria-label={strings.common.loading} className="mx-auto max-w-lg space-y-4 px-4 pt-6">
      <Skeleton className="h-8 w-40" />
      {variant === "today" && (
        <>
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </>
      )}
      {variant === "list" && (
        <>
          <Skeleton className="h-12 w-full rounded-xl" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </span>
            </div>
          ))}
        </>
      )}
      {variant === "cards" && (
        <>
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </>
      )}
      <span className="sr-only">{strings.common.loading}</span>
    </div>
  );
}
