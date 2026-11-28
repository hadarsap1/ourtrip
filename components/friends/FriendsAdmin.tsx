"use client";

import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { createFriendCode, listFriendLinks, revokeFriend, type FriendLink } from "@/lib/data/friends";
import { listMyGroups } from "@/lib/data/groups";
import { listKids } from "@/lib/data/kids";
import { friendInvite, friendState } from "@/lib/friends";
import { strings } from "@/lib/strings";
import type { Member } from "@/lib/types";

/** Parents: make a friend code, see who is connected, cut off. */
export function FriendsAdmin({ tripId, onChange }: { tripId: string; onChange: () => void }) {
  const f = strings.friends;
  const [kids, setKids] = useState<Member[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [kidId, setKidId] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ code: string; kid: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    setLinks(await listFriendLinks(tripId));
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listKids(tripId), listMyGroups("owner").catch(() => []), listFriendLinks(tripId)])
      .then(([nextKids, nextGroups, nextLinks]) => {
        if (cancelled) return;
        setKids(nextKids);
        setGroups(nextGroups);
        setLinks(nextLinks);
      })
      .catch(() => {
        if (!cancelled) showToast(strings.common.error);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, showToast]);

  const selectedKid = kids.find((k) => k.id === kidId) ?? kids[0] ?? null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !selectedKid || !name.trim()) return;
    setBusy(true);
    try {
      const code = await createFriendCode(selectedKid.id, name, picked);
      setInvite({ code, kid: selectedKid.display_name });
      setName("");
      setPicked([]);
      await refresh();
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!invite) return;
    const text = friendInvite(f.shareText, {
      kid: invite.kid,
      code: invite.code,
      url: `${window.location.origin}/kid-login`,
    });
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast(f.copied);
      }
    } catch {
      // the share sheet was closed: nothing to say
    }
  }

  async function handleRevoke(link: FriendLink) {
    const waiting = friendState(link) !== "connected";
    if (!waiting && !(await askConfirm(f.revokeConfirm.replace("{name}", link.friend_name)))) return;
    try {
      await revokeFriend(link.id);
      await refresh();
      onChange();
    } catch {
      showToast(strings.common.error);
    }
  }

  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${
      on ? "border-sea bg-sea-tint font-semibold text-sea-deep" : "border-line bg-surface text-ink-soft"
    }`;
  const stateText = { waiting: f.waiting, expired: f.expired, connected: f.connected, revoked: f.revoked };

  return (
    <>
      <section className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-lg font-bold text-ink">{f.newTitle}</h2>
        <p className="text-sm text-ink-soft">{f.newHint}</p>
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink-soft">{f.kidLabel}</legend>
            <div className="flex flex-wrap gap-1.5">
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={selectedKid?.id === k.id}
                  onClick={() => setKidId(k.id)}
                  className={chip(selectedKid?.id === k.id)}
                >
                  {k.display_name}
                </button>
              ))}
            </div>
          </fieldset>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={f.nameLabel}
            aria-label={f.nameLabel}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
          {groups.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink-soft">{f.groupsLabel}</legend>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = picked.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== g) : [...p, g]))}
                      className={chip(on)}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <button
            type="submit"
            disabled={busy || !selectedKid || !name.trim()}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-50"
          >
            {f.create}
          </button>
        </form>
      </section>

      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link) => {
            const state = friendState(link);
            const kid = kids.find((k) => k.id === link.kid_member_id)?.display_name ?? "";
            return (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">
                    {f.pair.replace("{kid}", kid).replace("{friend}", link.friend_name)}
                  </span>
                  <span className="block text-sm text-ink-soft">{stateText[state]}</span>
                </span>
                {(state === "connected" || state === "waiting") && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(link)}
                    className="min-h-11 shrink-0 font-semibold text-alert"
                  >
                    {state === "connected" ? f.revoke : f.cancelCode}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {invite && (
        <Sheet open onClose={() => setInvite(null)} title={f.create}>
          <div className="space-y-4 text-center">
            <p className="text-sm text-ink-soft">{f.codeReady}</p>
            <p className="rounded-2xl bg-sea-tint py-6 text-4xl font-bold tracking-[0.2em] text-sea" dir="ltr">
              {invite.code}
            </p>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea"
            >
              {f.share}
            </button>
            <button type="button" onClick={() => setInvite(null)} className="w-full py-2 font-semibold text-ink-soft">
              {strings.common.close}
            </button>
          </div>
        </Sheet>
      )}

      <Toast message={toast} />
    </>
  );
}
