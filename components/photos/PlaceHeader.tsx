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
    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
      <span className="flex items-center gap-1 text-base font-bold text-ink">
        <PinIcon className="h-4 w-4 self-center text-sea" />
        {group.place ?? strings.photos.noPlace}
        {group.country_code && <span aria-hidden>{flagEmoji(group.country_code)}</span>}
      </span>
      <span className="text-xs font-semibold text-ink-soft">
        <span dir="ltr">{dates}</span> ·{" "}
        {n === 1 ? strings.photos.countOne : strings.photos.count.replace("{n}", String(n))}
      </span>
    </h2>
  );
}
