"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { FriendChat } from "@/components/friends/FriendChat";
import { FriendsAdmin } from "@/components/friends/FriendsAdmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { listFriendChannels, type FriendChannel } from "@/lib/data/friends";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

/** The friends screen for the three who have one: a kid (their friends), a
 *  friend (their chats, one per kid; a single one opens at once) and a parent
 *  (invite, read, cut off). */
export function FriendsScreen() {
  const f = strings.friends;
  const { member, memberLoading } = useMember();
  const [channels, setChannels] = useState<FriendChannel[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChannels(await listFriendChannels());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch
    if (member) void load();
  }, [member, load]);

  if (memberLoading || !member) {
    return <p className="pt-8 text-center text-ink-soft">{strings.common.loading}</p>;
  }

  const isParent = member.role === "owner";
  // a friend with one chat goes straight in; with a chat per kid (00111) they
  // pick the kid from the list
  const only = member.role === "guest" && channels?.length === 1 ? channels[0] : null;
  const open = only ?? channels?.find((c) => c.link_id === openId) ?? null;

  if (open) {
    return (
      <FriendChat
        key={open.link_id}
        channel={open}
        member={member}
        onBack={
          only
            ? null
            : () => {
                setOpenId(null);
                void load();
              }
        }
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-5 pb-8 sm:max-w-2xl">
      <PageHeader title={f.title} />

      {loadFailed ? (
        <LoadFailed onRetry={load} />
      ) : channels === null ? (
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      ) : channels.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-soft">
          {f.empty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {channels.map((c) => (
            <li key={c.link_id}>
              <button
                type="button"
                onClick={() => setOpenId(c.link_id)}
                className="flex min-h-16 w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-start shadow-card active:bg-paper-deep"
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold text-ink">
                    {isParent
                      ? f.pair.replace("{kid}", c.kid_name).replace("{friend}", c.friend_name)
                      : member.id === c.friend_member_id
                        ? c.kid_name
                        : c.friend_name}
                  </span>
                  {c.revoked && <span className="block text-sm text-ink-soft">{f.revoked}</span>}
                </span>
                {c.unread > 0 && (
                  <span
                    aria-label={f.unread.replace("{n}", String(c.unread))}
                    className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-coral px-1.5 text-sm font-extrabold text-on-coral"
                  >
                    {c.unread > 9 ? "9+" : c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isParent && <FriendsAdmin tripId={member.trip_id} onChange={() => void load()} />}
    </div>
  );
}
