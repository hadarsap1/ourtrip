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
import { CheckIcon, LockIcon, PersonIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import type { Member, Trip } from "@/lib/types";

/** Turns a kid-auth failure into something worth reading. The function
 *  answers with a stable code; anything unrecognised keeps the generic text. */
function kidErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "network":
      return strings.kids.errorNetwork;
    case "forbidden":
      return strings.kids.errorForbidden;
    case "bad pin":
      return strings.kids.errorBadPin;
    case "bad member":
      return strings.kids.errorBadMember;
    default:
      return strings.common.error;
  }
}

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
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const activeDevice = (kidId: string) =>
    devices.find((d) => d.member_id === kidId && !d.revoked_at) ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.kids.title}</h1>

      {kids.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
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
            className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-ink">
                <PersonIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
                {kid.display_name}
              </h2>
              <button
                type="button"
                onClick={() => setCodeFor(kid)}
                className="rounded-xl bg-sea-tint px-3 py-2 text-sm font-semibold text-sea hover:bg-sea-tint"
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
                    {locked ? (
                      <>
                        <LockIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                        {strings.kids.deviceLocked}
                      </>
                    ) : (
                      <>
                        <CheckIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{" "}
                        {strings.kids.deviceActive}
                      </>
                    )}
                    <span className="mr-1 font-normal text-ink-soft">
                      · {strings.kids.connectedAt}{" "}
                      {formatDate(device.created_at.slice(0, 10))}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await askConfirm(strings.kids.revokeConfirm))) return;
                      void revokeDevice(device.id)
                        .then(() => trip && refresh(trip.id))
                        .catch((err) => showToast(kidErrorMessage(err)));
                    }}
                    className="font-semibold text-rose-500"
                  >
                    {strings.kids.revoke}
                  </button>
                </>
              ) : (
                <span className="text-ink-soft">{strings.kids.noDevice}</span>
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
            .catch((err) => showToast(kidErrorMessage(err)));
        }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={strings.kids.kidName}
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-sea px-4 py-2.5 text-sm font-semibold text-white hover:bg-sea-deep"
        >
          + {strings.kids.addKid}
        </button>
      </form>

      {codeFor && (
        <GenerateCodeSheet
          kid={codeFor}
          onClose={() => setCodeFor(null)}
          onError={(err) => showToast(kidErrorMessage(err))}
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
  onError: (error: unknown) => void;
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
    } catch (err) {
      onError(err);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${strings.kids.generateCode} - ${kid.display_name}`}
    >
      {code ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-ink-soft">{strings.kids.codeReady}</p>
          <p
            className="rounded-2xl bg-sea-tint py-6 text-5xl font-bold tracking-[0.3em] text-sea"
            dir="ltr"
          >
            {code}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-white"
          >
            {strings.common.close}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-4">
          <div>
            <label
              htmlFor="kid-pin"
              className="mb-1 block text-sm font-medium text-ink-soft"
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
              className="w-full rounded-xl border border-line px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em] focus:border-sea focus:outline-none"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !/^\d{4,6}$/.test(pin)}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-50"
          >
            {strings.kids.generateCode}
          </button>
        </form>
      )}
    </Sheet>
  );
}
