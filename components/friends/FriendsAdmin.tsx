"use client";

import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import {
  addFriendKid,
  closeFriendChat,
  createFriendCode,
  listFriendLinks,
  revokeFriend,
  type FriendLink,
} from "@/lib/data/friends";
import { listMyGroups } from "@/lib/data/groups";
import { listKids } from "@/lib/data/kids";
import { friendInvite, friendState, groupFriendLinks } from "@/lib/friends";
import { strings } from "@/lib/strings";
import type { Member } from "@/lib/types";

/** Parents: make a friend code, see who is connected, add a chat with another
 *  kid, close one chat, cut a friend off. */
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

  async function handleClose(link: FriendLink, kid: string) {
    const text = f.closeChatConfirm.replaceAll("{friend}", link.friend_name).replace("{kid}", kid);
    if (!(await askConfirm(text))) return;
    try {
      await closeFriendChat(link.id);
      await refresh();
      onChange();
    } catch {
      showToast(strings.common.error);
    }
  }

  async function handleAddKid(link: FriendLink, kid: Member) {
    if (busy) return;
    setBusy(true);
    try {
      await addFriendKid(link.id, kid.id);
      await refresh();
      onChange();
      showToast(f.kidAdded.replace("{kid}", kid.display_name));
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  const kidName = (id: string) => kids.find((k) => k.id === id)?.display_name ?? "";
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
          {groupFriendLinks(links).map(({ key, links: chats }) => {
            const first = chats[0];
            // a code not used yet (or expired, or cancelled): one row, as before
            if (!first.member_id) {
              const state = friendState(first);
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">
                      {f.pair.replace("{kid}", kidName(first.kid_member_id)).replace("{friend}", first.friend_name)}
                    </span>
                    <span className="block text-sm text-ink-soft">{stateText[state]}</span>
                  </span>
                  {state === "waiting" && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(first)}
                      className="min-h-11 shrink-0 font-semibold text-alert"
                    >
                      {f.cancelCode}
                    </button>
                  )}
                </li>
              );
            }
            // a connected friend: every chat of theirs, one per kid
            const open = chats.filter((c) => !c.revoked_at);
            const missing = open.length > 0 ? kids.filter((k) => !open.some((c) => c.kid_member_id === k.id)) : [];
            return (
              <li key={key} className="space-y-2 rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{first.friend_name}</span>
                    <span className="block text-sm text-ink-soft">
                      {open.length > 0 ? f.connected : f.revoked}
                    </span>
                  </span>
                  {open.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(open[0])}
                      className="min-h-11 shrink-0 font-semibold text-alert"
                    >
                      {f.revoke}
                    </button>
                  )}
                </div>
                <ul className="space-y-1 border-t border-line pt-2">
                  {chats.map((c) => (
                    <li key={c.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-ink">{f.chatWith.replace("{kid}", kidName(c.kid_member_id))}</span>
                        {c.revoked_at && open.length > 0 && <span className="text-ink-soft"> · {f.chatClosed}</span>}
                      </span>
                      {/* the last open chat is closed by cutting the friend off */}
                      {!c.revoked_at && open.length > 1 && (
                        <button
                          type="button"
                          onClick={() => void handleClose(c, kidName(c.kid_member_id))}
                          className="min-h-11 shrink-0 font-semibold text-alert"
                        >
                          {f.closeChat}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {missing.length > 0 && (
                  <div className="space-y-1.5 border-t border-line pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {missing.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAddKid(open[0], k)}
                          className={`${chip(false)} disabled:opacity-50`}
                        >
                          {f.addKid.replace("{kid}", k.display_name)}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft">{f.addKidHint}</p>
                  </div>
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
