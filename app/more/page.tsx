import Link from "next/link";
import { strings } from "@/lib/strings";

type Item = { href: string; emoji: string; label: string };

// Grouped so the long "more" list reads as a map, not a dump. Order within each
// group is by how often the family reaches for it on the road.
const groups: { kicker: string; items: Item[] }[] = [
  {
    kicker: strings.more.groupExplore,
    items: [
      { href: "/recommend", emoji: "✨", label: strings.more.menuRecommend },
      { href: "/map", emoji: "🗺️", label: strings.more.menuMap },
      { href: "/phrasebook", emoji: "💬", label: strings.more.menuPhrasebook },
      { href: "/options", emoji: "🏨", label: strings.more.menuOptions },
    ],
  },
  {
    kicker: strings.more.groupMemories,
    items: [
      { href: "/journal", emoji: "📖", label: strings.more.menuJournal },
      { href: "/photos", emoji: "📷", label: strings.more.menuPhotos },
      { href: "/memory-book", emoji: "📔", label: strings.more.menuMemoryBook },
      { href: "/messages", emoji: "💬", label: strings.more.menuMessages },
    ],
  },
  {
    kicker: strings.more.groupFamily,
    items: [
      { href: "/checklists", emoji: "✅", label: strings.more.menuChecklists },
      { href: "/pocket", emoji: "🪙", label: strings.more.menuPocket },
      { href: "/kids", emoji: "🧒", label: strings.more.menuKids },
      { href: "/guests", emoji: "✉️", label: strings.more.menuGuests },
      { href: "/notifications", emoji: "🔔", label: strings.more.menuNotifications },
    ],
  },
];

export default function MorePage() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-4">
      <h1 className="mb-6 text-2xl font-bold">{strings.nav.more}</h1>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.kicker}>
            <p className="ot-kicker mb-1.5 px-1">{group.kicker}</p>
            <ul className="ot-card divide-y divide-line overflow-hidden">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-3 font-medium text-ink active:bg-sea-tint/60"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sea-tint text-lg"
                      aria-hidden="true"
                    >
                      {item.emoji}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-line" aria-hidden="true">
                      ‹
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Emergency stays visually separate and unmistakable. */}
        <Link
          href="/emergency"
          className="ot-card flex items-center gap-3 border-rose-200 px-3 py-3 font-semibold text-rose-600 active:bg-rose-50"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-lg"
            aria-hidden="true"
          >
            🆘
          </span>
          <span className="flex-1">{strings.more.menuEmergency}</span>
          <span className="text-rose-200" aria-hidden="true">
            ‹
          </span>
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {strings.placeholders.more}
      </p>
    </div>
  );
}
