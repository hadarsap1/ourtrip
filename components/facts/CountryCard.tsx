"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { askConfirm } from "@/components/ConfirmSheet";
import {
  PROFILE_FIELDS,
  flagEmoji,
  generateCountryProfile,
  getCountryProfile,
  saveCountryProfile,
  type ProfileField,
} from "@/lib/data/countryProfile";
import { countryName } from "@/lib/data/emergency";
import { aiLimitMessage } from "@/lib/aiLimit";
import { strings } from "@/lib/strings";
import type { CountryProfile } from "@/lib/types";

const EDIT_FIELDS: ProfileField[] = ["flag_meaning", ...PROFILE_FIELDS];

function emptyDraft(p: CountryProfile | null): Record<ProfileField, string> {
  return Object.fromEntries(
    EDIT_FIELDS.map((f) => [f, p?.[f] ?? ""])
  ) as Record<ProfileField, string>;
}

// The country card at the top of "הידעת": the flag, why it looks that way, and
// a few lines a kid can compare with home. Keyed by country, so every stretch
// of Japan shows the same card. Kids only read it - RLS (00090) grants them
// select and nothing else.
export function CountryCard({
  tripId,
  countryCode,
  isOwner,
  memberId,
  onToast,
}: {
  tripId: string;
  countryCode: string;
  isOwner: boolean;
  memberId: string | null;
  onToast: (message: string) => void;
}) {
  const s = strings.facts.country;
  const [profile, setProfile] = useState<CountryProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(null));

  const load = useCallback(async () => {
    const result = await getCountryProfile(tripId, countryCode);
    setProfile(result.profile);
    setLoaded(true);
  }, [tripId, countryCode]);

  // The parent keys this card by country, so a new country is a fresh mount
  // and there is no previous card to clear here.
  useEffect(() => {
    let cancelled = false;
    void getCountryProfile(tripId, countryCode).then((result) => {
      if (cancelled) return;
      setProfile(result.profile);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, countryCode]);

  async function runGenerate() {
    if (busy) return;
    if (profile?.source === "manual" && !(await askConfirm(s.regenerateConfirm))) {
      return;
    }
    setBusy(true);
    try {
      await generateCountryProfile(countryCode);
      await load();
      onToast(s.generated);
    } catch (err) {
      const code = (err as Error).message;
      const f = strings.facts;
      onToast(
        aiLimitMessage(code) ??
          (code === "not_configured"
            ? f.notConfigured
            : code === "no_credit"
              ? f.noCredit
              : f.generateFailed)
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await saveCountryProfile(tripId, countryCode, draft, memberId);
      await load();
      setEditing(false);
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  // A kid with no card yet sees the facts alone rather than an empty box.
  if (!profile && !isOwner) return null;

  const country = countryName(countryCode);
  const lines = PROFILE_FIELDS.filter((f) => profile?.[f]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-4xl leading-none" aria-hidden="true">
          {flagEmoji(countryCode)}
        </span>
        <h2 className="text-lg font-bold text-ink">
          {s.title.replace("{country}", country)}
        </h2>
      </div>

      {profile ? (
        <>
          {isOwner && profile.source === "ai" && (
            <p className="mt-3 rounded-xl bg-sun-tint px-3 py-2 text-xs text-sun-deep">
              {s.verifyHint}
            </p>
          )}
          {profile.flag_meaning && (
            <div className="mt-3 rounded-xl bg-sea-tint/40 p-3">
              <p className="text-sm font-bold text-ink">{s.flag_meaning}</p>
              {/* Kids read this, so it is set larger than body copy. */}
              <p className="mt-1 text-base leading-relaxed text-ink">
                {profile.flag_meaning}
              </p>
            </div>
          )}
          {lines.length > 0 && (
            <dl className="mt-3 space-y-2.5">
              {lines.map((f) => (
                <div key={f}>
                  <dt className="text-xs font-semibold text-ink-soft">{s[f]}</dt>
                  <dd className="text-base leading-relaxed text-ink">
                    {profile[f]}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">{s.empty}</p>
      )}

      {isOwner && (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={busy}
            className="rounded-2xl bg-sea py-3 text-sm font-bold text-on-sea disabled:opacity-60"
          >
            {busy ? s.generating : profile ? s.regenerate : s.generate}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft(profile));
              setEditing(true);
            }}
            disabled={busy}
            className="rounded-2xl border border-line bg-surface py-3 text-sm font-bold text-sea disabled:opacity-60"
          >
            {strings.common.edit}
          </button>
        </div>
      )}

      {editing && (
        <Sheet open onClose={() => setEditing(false)} title={s.edit}>
          {EDIT_FIELDS.map((f) => (
            <label key={f} className="mt-3 block text-sm font-medium text-ink first:mt-0">
              {s[f]}
              <textarea
                value={draft[f]}
                onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                rows={f === "flag_meaning" ? 4 : 2}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="mt-3 w-full rounded-2xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-40"
          >
            {strings.common.save}
          </button>
        </Sheet>
      )}
    </section>
  );
}
