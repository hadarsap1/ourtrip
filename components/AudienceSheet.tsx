"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { listMyGroups } from "@/lib/data/groups";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

/**
 * Who something goes to (migration 00063): everyone, or one or more guest
 * groups. Used for wall messages, stories and photos. The database checks
 * the choice; this only offers the groups the caller may pick.
 */
export function AudienceSheet({
  groups,
  value,
  onClose,
  onSave,
}: {
  groups: string[];
  value: string[];
  onClose: () => void;
  onSave: (audience: string[]) => Promise<void> | void;
}) {
  const [picked, setPicked] = useState<string[]>(value);
  const [busy, setBusy] = useState(false);
  const toggle = (g: string) =>
    setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${
      on ? "border-sea bg-sea-tint font-semibold text-sea-deep" : "border-line bg-surface text-ink-soft"
    }`;

  return (
    <Sheet open onClose={onClose} title={strings.audience.title}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">{strings.audience.hint}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={picked.length === 0}
            onClick={() => setPicked([])}
            className={chip(picked.length === 0)}
          >
            {picked.length === 0 && "✓ "}
            {strings.audience.everyone}
          </button>
          {/* the value's own groups too, so a group no guest is in any more can
              still be taken off */}
          {[...new Set([...groups, ...value])].sort((a, b) => a.localeCompare(b, "he")).map((g) => (
            <button key={g} type="button" aria-pressed={picked.includes(g)} onClick={() => toggle(g)} className={chip(picked.includes(g))}>
              {picked.includes(g) && "✓ "}
              {g}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void Promise.resolve(onSave(picked)).finally(() => setBusy(false));
          }}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {strings.audience.save}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * "לכל האורחים" / "רק ל: כיתה עומר" with a button that opens the sheet. Loads
 * the groups this member may address itself; shows nothing if there are none.
 */
export function AudienceRow({
  label,
  value,
  onChange,
}: {
  /** a heading above the row, shown only when the row is */
  label?: string;
  value: string[];
  onChange: (audience: string[]) => void;
}) {
  const [groups, setGroups] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const role = useMember().member?.role;

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    void listMyGroups(role)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [role]);

  if (!groups || (groups.length === 0 && value.length === 0)) return null;
  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium text-ink-soft">{label}</p>}
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
        {value.length === 0 ? strings.audience.allGuests : strings.audience.onlyTo.replace("{to}", value.join(", "))}
        <button type="button" onClick={() => setOpen(true)} className="min-h-8 font-semibold text-sea underline">
          {strings.audience.change}
        </button>
      </p>
      {open && (
        <AudienceSheet
          groups={groups}
          value={value}
          onClose={() => setOpen(false)}
          onSave={(audience) => {
            onChange(audience);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
