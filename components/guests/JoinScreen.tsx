"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getJoinInfo, submitJoinRequest } from "@/lib/data/guests";
import {
  forgetJoinToken,
  nameFromGoogle,
  rememberJoinToken,
  rememberedJoinToken,
  type SubmitResult,
} from "@/lib/guestJoin";
import { strings } from "@/lib/strings";

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "member" }
  | { kind: "pending"; via: "google" | "email" }
  | { kind: "signedIn"; email: string; name: string }
  | { kind: "form" };

export function JoinScreen({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const afterSubmit = useCallback((result: SubmitResult, via: "google" | "email") => {
    if (result === "pending") setPhase({ kind: "pending", via });
    else if (result === "member") setPhase({ kind: "member" });
    else if (result === "invalid") setPhase({ kind: "invalid" });
    else setError(result === "busy" ? strings.join.busy : strings.join.badInput);
  }, []);

  const load = useCallback(async () => {
    try {
      // getJoinInfo rejects when Supabase is not configured; nothing here sets
      // state before the first await
      const info = await getJoinInfo(token);
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
      const user = data.session?.user;
      if (!info.valid) {
        if (rememberedJoinToken() === token) forgetJoinToken();
        setPhase({ kind: "invalid" });
      } else if (info.status === "member") {
        forgetJoinToken();
        setPhase({ kind: "member" });
      } else if (info.status === "pending") {
        setPhase({ kind: "pending", via: user ? "google" : "email" });
      } else if (user?.email) {
        const googleName = nameFromGoogle(user.user_metadata, user.email);
        // back from the Google button on this page: send without another tap
        if (rememberedJoinToken() === token) {
          afterSubmit(await submitJoinRequest(token, googleName), "google");
        } else {
          setPhase({ kind: "signedIn", email: user.email, name: googleName });
        }
      } else {
        setPhase({ kind: "form" });
      }
    } catch {
      setError(strings.join.error);
      setPhase({ kind: "form" });
    }
  }, [token, afterSubmit]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function withGoogle() {
    const supabase = getSupabase();
    if (!supabase) return;
    setError(null);
    rememberJoinToken(token);
    // Back to the root (the redirect the auth settings allow); the auth gate
    // sees the remembered token and returns here.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(strings.join.error);
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError(strings.join.error);
    } finally {
      setBusy(false);
    }
  }

  const buttonPrimary =
    "w-full rounded-full bg-sea px-8 py-3.5 text-center font-semibold text-on-sea shadow-sm active:bg-sea-deep disabled:opacity-60";
  const buttonSecondary =
    "w-full rounded-full border border-line bg-surface px-8 py-3 text-center font-semibold text-ink-soft disabled:opacity-60";

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 pb-16 pt-8">
      <div className="ot-postcard mb-6 p-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand badge */}
        <img
          src="/sovev/badge-192.png"
          alt=""
          className="relative z-10 mx-auto h-20 w-20 rounded-full border-[3px] border-white/90 object-cover"
        />
        <h1 className="relative z-10 mt-3 text-3xl">{strings.appName}</h1>
      </div>

      {phase.kind === "loading" && (
        <p className="text-center text-ink-soft" role="status">
          {strings.common.loading}
        </p>
      )}

      {phase.kind === "invalid" && (
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-bold">{strings.join.invalidTitle}</h2>
          <p className="text-ink-soft">{strings.join.invalidBody}</p>
        </div>
      )}

      {phase.kind === "member" && (
        <div className="space-y-4 text-center">
          <h2 className="text-xl font-bold">{strings.join.memberTitle}</h2>
          <button
            type="button"
            className={buttonPrimary}
            // a full load: the auth gate and member store start over and see the new access
            onClick={() => window.location.replace(window.location.origin)}
          >
            {strings.join.enter}
          </button>
        </div>
      )}

      {phase.kind === "pending" && (
        <div className="space-y-4 text-center">
          <h2 className="text-xl font-bold">{strings.join.pendingTitle}</h2>
          <p className="text-ink-soft">
            {phase.via === "google" ? strings.join.pendingBodyGoogle : strings.join.pendingBodyEmail}
          </p>
          {phase.via === "google" && (
            <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void run(load)}>
              {strings.join.checkAgain}
            </button>
          )}
        </div>
      )}

      {phase.kind === "signedIn" && (
        <div className="space-y-3 text-center">
          <h2 className="text-xl font-bold">{strings.join.title}</h2>
          <JoinAbout />
          <button
            type="button"
            className={buttonPrimary}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                rememberJoinToken(token);
                afterSubmit(await submitJoinRequest(token, phase.name), "google");
              })
            }
          >
            <span dir="auto">{strings.join.joinAs.replace("{email}", phase.email)}</span>
          </button>
          <button
            type="button"
            className="text-sm text-ink-soft underline"
            onClick={() =>
              void run(async () => {
                await getSupabase()?.auth.signOut();
                setPhase({ kind: "form" });
              })
            }
          >
            {strings.join.otherAccount}
          </button>
        </div>
      )}

      {phase.kind === "form" && (
        <div className="space-y-4">
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-bold">{strings.join.title}</h2>
          </div>
          <JoinAbout />
          <div className="space-y-1">
            <button type="button" className={buttonPrimary} onClick={() => void withGoogle()}>
              {strings.join.google}
            </button>
            <p className="text-center text-xs text-ink-soft">{strings.join.googleHint}</p>
          </div>
          <p className="flex items-center gap-3 text-sm text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            {strings.join.or}
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                afterSubmit(await submitJoinRequest(token, name.trim(), email.trim()), "email");
              });
            }}
          >
            <div>
              <label htmlFor="join-name" className="mb-1 block text-sm font-medium text-ink-soft">
                {strings.join.name}
              </label>
              <input
                id="join-name"
                type="text"
                required
                maxLength={60}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base focus:border-sea focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="join-email" className="mb-1 block text-sm font-medium text-ink-soft">
                {strings.join.email}
              </label>
              <input
                id="join-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                inputMode="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base focus:border-sea focus:outline-none"
              />
            </div>
            <button type="submit" className={buttonSecondary} disabled={busy}>
              {strings.join.send}
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="mt-5 text-center text-sm text-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** What this is, for a parent who scanned a sticker from a classmate. */
function JoinAbout() {
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-4 text-start">
      <p className="text-sm text-ink">{strings.join.aboutIntro}</p>
      <ul className="space-y-1.5">
        {strings.join.aboutItems.map((item) => (
          <li key={item.text} className="flex items-start gap-2 text-sm text-ink">
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft">{strings.join.aboutPrivacy}</p>
    </div>
  );
}
