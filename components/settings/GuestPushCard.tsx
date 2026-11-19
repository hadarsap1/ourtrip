"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { currentPushState, disablePush, enablePush, isIos, isStandalone, type PushState } from "@/lib/push";
import { ShareIcon } from "@/components/icons";
import { getMyEmailDigest, setMyEmailDigest } from "@/lib/data/guestEmail";
import { isEnabled } from "@/lib/flags";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.guestPush;
// per device: "not now" on the home invite. The settings card stays.
const DISMISS_KEY = "ot.guestPushInviteDismissed";
// its own key: "not now" on the install steps in Safari must not hide the
// push invite once the app is opened from the home screen
const IOS_DISMISS_KEY = "ot.guestPushIosInviteDismissed";

/**
 * A guest's push switch (00100, DECISIONS #71). On = this device has a
 * push_subscriptions row (self-scoped RLS, 00010); push-send then sends a
 * guest new updates and podcast episodes they may see, and nothing else.
 */
function useGuestPush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void currentPushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await enablePush());
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      setState("default");
    } catch {
      setError(strings.common.error);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, turnOn, turnOff };
}

/** Settings: always there for a guest, on or off. */
export function GuestPushCard() {
  const { member } = useMember();
  if (member?.role !== "guest") return null;
  return <GuestPushSettings />;
}

function GuestPushSettings() {
  const { state, busy, error, turnOn, turnOff } = useGuestPush();
  const iosNeedsInstall = isIos() && !isStandalone();

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.title}</h2>
      <p className="mt-1 mb-3 text-xs text-ink-soft">{t.hint}</p>
      {iosNeedsInstall ? (
        <p className="rounded-xl bg-sun-tint px-3 py-2 text-sm text-sun-deep">{t.iosInstall}</p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-ink-soft">{t.unsupported}</p>
      ) : state === "denied" ? (
        <p className="text-sm text-alert">{t.denied}</p>
      ) : state === "subscribed" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-sea">{t.on}</p>
          <button
            type="button"
            onClick={() => void turnOff()}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-line px-4 text-sm font-bold text-ink-soft disabled:opacity-50"
          >
            {t.turnOff}
          </button>
        </div>
      ) : state === "default" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">{t.off}</p>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy}
            className="min-h-[44px] rounded-xl bg-sea px-4 text-sm font-bold text-on-sea disabled:opacity-50"
          >
            {busy ? t.working : t.enable}
          </button>
        </div>
      ) : null}
      {error && <p className="mt-2 text-sm text-alert" role="alert">{error}</p>}
    </section>
  );
}

const noop = () => () => {};

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
const readDismissed = () => readFlag(DISMISS_KEY);
const readIosDismissed = () => readFlag(IOS_DISMISS_KEY);
const readIosNeedsInstall = () => isIos() && !isStandalone();

function storeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // the card comes back next visit; settings still has the switch
  }
}

/** The guest home: asks once, until the guest says yes or "not now". On an
 *  iPhone or iPad in Safari, where push needs the app on the home screen
 *  first, it shows those steps instead (DECISIONS #71). */
export function GuestPushInvite() {
  const iosNeedsInstall = useSyncExternalStore(noop, readIosNeedsInstall, () => false);
  return iosNeedsInstall ? <IosInstallInvite /> : <PushInvite />;
}

const readEmailFlag = () => isEnabled("guestEmailDigest");

function IosInstallInvite() {
  const stored = useSyncExternalStore(noop, readIosDismissed, () => true);
  const emailOffered = useSyncExternalStore(noop, readEmailFlag, () => false);
  const [dismissedNow, setDismissedNow] = useState(false);
  // a guest who already chose the email has their answer: no card
  const [emailOn, setEmailOn] = useState<boolean | null>(null);
  const [emailDone, setEmailDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!emailOffered) return;
    let alive = true;
    getMyEmailDigest()
      .then((on) => alive && setEmailOn(on))
      .catch(() => alive && setEmailOn(false));
    return () => {
      alive = false;
    };
  }, [emailOffered]);

  const chooseEmail = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await setMyEmailDigest(true);
      setEmailDone(true);
      storeFlag(IOS_DISMISS_KEY);
    } catch {
      setError(strings.common.error);
    } finally {
      setBusy(false);
    }
  }, []);

  if (emailDone) {
    return (
      <section className="rounded-card border border-sv-line bg-sv-card px-4 py-3.5">
        <p className="text-sm font-semibold text-sv-sage" role="status">{t.iosInviteEmailDone}</p>
      </section>
    );
  }
  if (stored || dismissedNow || emailOn === true) return null;

  return (
    <section className="rounded-card border border-sv-line bg-sv-card px-4 py-3.5">
      <p className="text-base font-bold text-sv-ink">{t.iosInviteTitle}</p>
      <p className="mt-0.5 text-sm text-sv-ink-soft">{t.iosInviteBody}</p>
      <ol className="mt-2.5 space-y-1.5 text-sm text-sv-ink">
        <li className="flex items-center gap-2">
          <span className="font-bold">1.</span>
          <span className="flex items-center gap-1">
            {t.iosInviteStep1}
            <ShareIcon className="h-4 w-4 shrink-0 text-sv-sage" aria-hidden="true" />
          </span>
        </li>
        <li className="flex gap-2"><span className="font-bold">2.</span>{t.iosInviteStep2}</li>
        <li className="flex gap-2"><span className="font-bold">3.</span>{t.iosInviteStep3}</li>
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {emailOffered && emailOn === false && (
          <button
            type="button"
            onClick={() => void chooseEmail()}
            disabled={busy}
            className="min-h-[44px] rounded-full border border-sv-sage px-4 text-sm font-bold text-sv-sage disabled:opacity-50"
          >
            {busy ? t.working : t.iosInviteEmail}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setDismissedNow(true);
            storeFlag(IOS_DISMISS_KEY);
          }}
          className="min-h-[44px] rounded-full px-3 text-sm font-semibold text-sv-ink-soft"
        >
          {t.later}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-alert" role="alert">{error}</p>}
    </section>
  );
}

/** Settings: the daily email, for a guest, once the flag is on. */
export function GuestEmailCard() {
  const { member } = useMember();
  const offered = useSyncExternalStore(noop, readEmailFlag, () => false);
  if (member?.role !== "guest" || !offered) return null;
  return <GuestEmailSettings email={member.email} />;
}

function GuestEmailSettings({ email }: { email: string | null }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyEmailDigest()
      .then((v) => alive && setOn(v))
      .catch(() => alive && setError(strings.common.error));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setMyEmailDigest(next);
      setOn(next);
    } catch {
      setError(strings.common.error);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.emailTitle}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t.emailHint}</p>
      {email && (
        <p className="mt-1 mb-3 text-xs text-ink-soft">
          {t.emailTo.split("{email}")[0]}
          <bdi dir="ltr">{email}</bdi>
        </p>
      )}
      {on !== null && (
        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm ${on ? "font-semibold text-sea" : "text-ink-soft"}`}>{on ? t.emailOn : t.emailOff}</p>
          <button
            type="button"
            onClick={() => void toggle(!on)}
            disabled={busy}
            className={
              on
                ? "min-h-[44px] rounded-xl border border-line px-4 text-sm font-bold text-ink-soft disabled:opacity-50"
                : "min-h-[44px] rounded-xl bg-sea px-4 text-sm font-bold text-on-sea disabled:opacity-50"
            }
          >
            {busy ? t.working : on ? t.emailDisable : t.emailEnable}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-alert" role="alert">{error}</p>}
    </section>
  );
}

function PushInvite() {
  const { state, busy, error, turnOn } = useGuestPush();
  // stored: read on the device only (the server render shows nothing)
  const stored = useSyncExternalStore(noop, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = stored || dismissedNow;

  const later = useCallback(() => {
    setDismissedNow(true);
    storeFlag(DISMISS_KEY);
  }, []);

  // only where it can work right now; a blocked permission is explained in settings
  if (dismissed || state !== "default") return null;

  return (
    <section className="rounded-card border border-sv-line bg-sv-card px-4 py-3.5">
      <p className="text-base font-bold text-sv-ink">{t.inviteTitle}</p>
      <p className="mt-0.5 text-sm text-sv-ink-soft">{t.inviteBody}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="min-h-[44px] rounded-full bg-sv-sage-fill px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? t.working : t.enable}
        </button>
        <button
          type="button"
          onClick={later}
          className="min-h-[44px] rounded-full px-3 text-sm font-semibold text-sv-ink-soft"
        >
          {t.later}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-alert" role="alert">{error}</p>}
    </section>
  );
}
