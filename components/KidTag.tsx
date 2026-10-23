import { kidTagText } from "@/lib/kidTag";

/** "של יואב" next to a guest's name (00067). Nothing when there is no tag. */
export function KidTag({ names, className = "" }: { names: readonly string[] | null | undefined; className?: string }) {
  const text = kidTagText(names);
  if (!text) return null;
  return (
    <span
      className={`ms-1.5 inline-block max-w-full truncate rounded-full bg-paper-deep px-2 py-px align-middle text-[11px] font-semibold text-ink-soft ${className}`}
    >
      {text}
    </span>
  );
}
