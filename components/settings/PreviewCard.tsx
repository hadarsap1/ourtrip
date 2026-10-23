"use client";

import { useEffect, useState } from "react";
import { listAllowlist } from "@/lib/data/guests";
import { getActiveTrip } from "@/lib/data/trip";
import { startPreview, type PreviewRole } from "@/lib/preview";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.preview;

/**
 * "View as a guest / a kid" (00068), parents only. The switch itself is a
 * real session minted by preview-session, which checks the parent role again.
 */
export function PreviewCard() {
  const { member } = useMember();
  const [picking, setPicking] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<PreviewRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = member?.role === "owner";

  useEffect(() => {
    if (!owner || !picking) return;
    let alive = true;
    void (async () => {
      const trip = await getActiveTrip();
      if (!trip) return;
      const rows = await listAllowlist(trip.id);
      if (alive) setGroups([...new Set(rows.flatMap((r) => r.labels))].sort((a, b) => a.localeCompare(b, "he")));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [owner, picking]);

  if (!owner) return null;

  async function go(role: PreviewRole) {
    if (busy) return;
    setBusy(role);
    setError(null);
    try {
      await startPreview(role, chosen);
    } catch (err) {
      const message = (err as Error).message;
      setError(/not found|404|failed to send/i.test(message) ? t.notDeployed : t.error);
      setBusy(null);
    }
  }

  const toggle = (label: string) =>
    setChosen((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  return (
    <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.title}</h2>
      <p className="mt-1 text-[12px] text-ink-soft">{t.hint}</p>

      {picking ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-ink">{t.groupsTitle}</p>
          <p className="text-[12px] text-ink-soft">{t.groupsHint}</p>
          {groups.length === 0 ? (
            <p className="text-[12px] text-ink-soft">{t.noGroups}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggle(g)}
                  aria-pressed={chosen.includes(g)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    chosen.includes(g) ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink-soft"
                  }`}
                >
                  {chosen.includes(g) && "✓ "}
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void go("guest")}
              className="min-h-[44px] flex-1 rounded-xl bg-sea text-sm font-bold text-on-sea disabled:opacity-60"
            >
              {busy === "guest" ? t.starting : t.start}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setPicking(false)}
              className="min-h-[44px] rounded-xl border border-line px-4 text-sm font-bold text-ink-soft"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setPicking(true)}
            className="min-h-[44px] rounded-xl bg-sea text-sm font-bold text-on-sea disabled:opacity-60"
          >
            {t.asGuest}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void go("kid")}
            className="min-h-[44px] rounded-xl border border-sea text-sm font-bold text-sea disabled:opacity-60"
          >
            {busy === "kid" ? t.starting : t.asKid}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
