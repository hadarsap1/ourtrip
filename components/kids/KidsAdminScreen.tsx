"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  addKid,
  createRegistration,
  listDevices,
  listKids,
  revokeDevice,
  type KidDevice,
} from "@/lib/data/kids";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Member, Trip } from "@/lib/types";

export function KidsAdminScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [kids, setKids] = useState<Member[]>([]);
  const [devices, setDevices] = useState<KidDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [codeFor, setCodeFor] = useState<Member | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextKids, nextDevices] = await Promise.all([
      listKids(tripId),
      listDevices(),
    ]);
    setKids(nextKids);
    setDevices(nextDevices);
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
        <p className="text-center text-slate-500">{strings.common.loading}</p>
      </div>
    );
  }

  const activeDevice = (kidId: string) =>
    devices.find((d) => d.member_id === kidId && !d.revoked_at) ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.kids.title}</h1>

      {kids.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {strings.kids.noKids}
        </p>
      )}

      {kids.map((kid) => {
        const device = activeDevice(kid.id);
        const locked =
          device?.locked_until && new Date(device.locked_until) > new Date();
        return (
          <section
            key={kid.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-800">
                🧒 {kid.display_name}
              </h2>
              <button
                type="button"
                onClick={() => setCodeFor(kid)}
                className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100"
              >
                {strings.kids.generateCode}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              {device ? (
                <>
                  <span
                    className={`font-semibold ${
                      locked ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    {locked ? "🔒 " + strings.kids.deviceLocked : "✓ " + strings.kids.deviceActive}
                    <span className="mr-1 font-normal text-slate-400">
                      · {strings.kids.connectedAt}{" "}
                      {formatDate(device.created_at.slice(0, 10))}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(strings.kids.revokeConfirm)) return;
                      void revokeDevice(device.id)
                        .then(() => trip && refresh(trip.id))
                        .catch(() => showToast(strings.common.error));
                    }}
                    className="font-semibold text-rose-500"
                  >
                    {strings.kids.revoke}
                  </button>
                </>
              ) : (
                <span className="text-slate-400">{strings.kids.noDevice}</span>
              )}
            </div>
          </section>
        );
      })}

      {/* add kid */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name || !trip) return;
          setNewName("");
          void addKid(trip.id, name)
            .then(() => refresh(trip.id))
            .catch(() => showToast(strings.common.error));
        }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={strings.kids.kidName}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          + {strings.kids.addKid}
        </button>
      </form>

      {codeFor && (
        <GenerateCodeSheet
          kid={codeFor}
          onClose={() => setCodeFor(null)}
          onError={() => showToast(strings.common.error)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function GenerateCodeSheet({
  kid,
  onClose,
  onError,
}: {
  kid: Member;
  onClose: () => void;
  onError: () => void;
}) {
  const [pin, setPin] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !/^\d{4,6}$/.test(pin)) return;
    setBusy(true);
    try {
      setCode(await createRegistration(kid.id, pin));
    } catch {
      onError();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${strings.kids.generateCode} — ${kid.display_name}`}
    >
      {code ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-500">{strings.kids.codeReady}</p>
          <p
            className="rounded-2xl bg-teal-50 py-6 text-5xl font-bold tracking-[0.3em] text-teal-700"
            dir="ltr"
          >
            {code}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white"
          >
            {strings.common.close}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-4">
          <div>
            <label
              htmlFor="kid-pin"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              {strings.kids.pinLabel}
            </label>
            <input
              id="kid-pin"
              type="text"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em] focus:border-teal-500 focus:outline-none"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !/^\d{4,6}$/.test(pin)}
            className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {strings.kids.generateCode}
          </button>
        </form>
      )}
    </Sheet>
  );
}
