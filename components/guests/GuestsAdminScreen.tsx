"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  inviteGuest,
  listAllowlist,
  revokeGuest,
  type GuestAllowlistRow,
} from "@/lib/data/guests";
import { formatDate } from "@/lib/format";
import { ClipboardIcon, MailIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";

export function GuestsAdminScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allowlist, setAllowlist] = useState<GuestAllowlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setAllowlist(await listAllowlist(tripId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.guests.title}</h1>

      {allowlist.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          {strings.guests.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {allowlist.map((row) => {
            const revoked = row.revoked_at !== null;
            return (
              <li
                key={row.email}
                className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 shadow-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink" dir="ltr">
                    {row.email}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      revoked ? "text-rose-500" : "text-emerald-600"
                    }`}
                  >
                    {revoked ? strings.guests.revoked : strings.guests.active}
                    <span className="mr-1 font-normal text-ink-soft">
                      · {formatDate(row.created_at.slice(0, 10))}
                    </span>
                  </span>
                </span>
                {!revoked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(strings.guests.revokeConfirm)) return;
                      void revokeGuest(row.trip_id, row.email)
                        .then(() => trip && refresh(trip.id))
                        .catch(() => showToast(strings.common.error));
                    }}
                    className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600"
                  >
                    {strings.guests.revoke}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep"
      >
        <MailIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.guests.invite}
      </button>

      {inviteOpen && (
        <InviteSheet
          onClose={() => {
            setInviteOpen(false);
            if (trip) void refresh(trip.id).catch(() => {});
          }}
          onToast={showToast}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function InviteSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setResult(await inviteGuest(email.trim(), name.trim()));
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={strings.guests.invite}>
      {result ? (
        <div className="space-y-4">
          <p className="text-center text-sm font-medium text-ink-soft">
            {result.emailed ? strings.guests.emailed : strings.guests.linkReady}
          </p>
          <p className="break-all rounded-xl bg-paper-deep p-3 text-xs text-ink-soft" dir="ltr">
            {result.link}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(result.link)
                .then(() => onToast(strings.guests.copied))
                .catch(() => {});
            }}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-white"
          >
            <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
            {strings.guests.copyLink}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft"
          >
            {strings.common.close}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
          <div>
            <label htmlFor="guest-name" className="mb-1 block text-sm font-medium text-ink-soft">
              {strings.guests.name}
            </label>
            <input
              id="guest-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="guest-email" className="mb-1 block text-sm font-medium text-ink-soft">
              {strings.guests.email}
            </label>
            <input
              id="guest-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
          >
            {strings.guests.send}
          </button>
        </form>
      )}
    </Sheet>
  );
}
