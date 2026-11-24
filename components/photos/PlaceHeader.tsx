import { PinIcon } from "@/components/icons";
import { flagEmoji } from "@/lib/countries";
import { formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { PlaceGroup } from "@/lib/photoPlaces";

/** "📍 האנוי 🇻🇳 · 26/10 - 29/10 · 5 תמונות" over a place's photos. */
export function PlaceHeader<P>({ group }: { group: PlaceGroup<P> }) {
  const dates =
    group.from === group.to
      ? formatShortDate(group.from)
      : strings.photos.placeDates
          .replace("{from}", formatShortDate(group.from))
          .replace("{to}", formatShortDate(group.to));
  const n = group.photos.length;
  return (
    <h2 className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-0.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[22px] font-extrabold leading-tight text-ink">
        <PinIcon className="h-5 w-5 shrink-0 self-center text-green" />
        <bdi className="truncate">{group.place ?? strings.photos.noPlace}</bdi>
        {group.country_code && <span aria-hidden>{flagEmoji(group.country_code)}</span>}
      </span>
      <span className="text-sm font-medium text-muted">
        <span dir="ltr">{dates}</span> ·{" "}
        {n === 1 ? strings.photos.countOne : strings.photos.count.replace("{n}", String(n))}
      </span>
    </h2>
  );
}
