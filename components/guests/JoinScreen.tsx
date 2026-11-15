"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getJoinInfo, submitJoinRequest } from "@/lib/data/guests";
import {
  forgetJoinToken,
  nameFromGoogle,
  rememberJoinKids,
  rememberJoinToken,
  rememberedJoinKids,
  rememberedJoinToken,
  type SubmitResult,
} from "@/lib/guestJoin";
import { normalizeKidNames } from "@/lib/kidTag";
import { KidNamesField } from "@/components/guests/KidNamesField";
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
  const [kidNames, setKidNames] = useState<string[]>([]);
  // the login screen's open token (00095): Google only, and no names on the page
  const [googleOnly, setGoogleOnly] = useState(false);

  const afterSubmit = useCallback((result: SubmitResult, via: "google" | "email") => {
    if (result === "pending") setPhase({ kind: "pending", via });
    else if (result === "member") setPhase({ kind: "member" });
    else if (result === "invalid") setPhase({ kind: "invalid" });
    else if (result === "google_only") {
      setGoogleOnly(true);
      setError(strings.join.googleOnlyHint);
    } else setError(result === "busy" ? strings.join.busy : strings.join.badInput);
  }, []);

  const load = useCallback(async () => {
    try {
      // getJoinInfo rejects when Supabase is not configured; nothing here sets
      // state before the first await
      const info = await getJoinInfo(token);
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
      const user = data.session?.user;
      setGoogleOnly(info.googleOnly);
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
          afterSubmit(await submitJoinRequest(token, googleName, undefined, rememberedJoinKids()), "google");
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
    rememberJoinKids(normalizeKidNames(kidNames));
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
        <p className="relative z-10 mt-1 text-sm text-white/85">{strings.join.postcardLine}</p>
      </div>

      {phase.kind === "loading" && (
        <p className="text-center text-ink-soft" role="status">
          {strings.common.loading}
        </p>
      )}

      {phase.kind === "invalid" && (
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-bold text-ink">{strings.join.invalidTitle}</h2>
          <p className="text-ink-soft">{strings.join.invalidBody}</p>
        </div>
      )}

      {phase.kind === "member" && (
        <div className="space-y-4 text-center">
          <h2 className="text-lg font-bold text-ink">{strings.join.memberTitle}</h2>
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
          <h2 className="text-lg font-bold text-ink">{strings.join.pendingTitle}</h2>
          <p className="text-ink">{strings.join.pendingWait}</p>
          <p className="text-sm text-ink-soft">
            {phase.via === "google" ? strings.join.pendingBodyGoogle : strings.join.pendingBodyEmail}
          </p>
          <p className="sovev-display text-xl text-ink">{strings.join.signature}</p>
          {phase.via === "google" && (
            <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void run(load)}>
              {strings.join.checkAgain}
            </button>
          )}
        </div>
      )}

      {phase.kind === "signedIn" && (
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-bold text-ink">{strings.join.title}</h2>
          <JoinAbout />
          <div className="text-start">
            <KidNamesField id="join-kids-google" value={kidNames} onChange={setKidNames} />
          </div>
          <button
            type="button"
            className={buttonPrimary}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                rememberJoinToken(token);
                afterSubmit(
                  await submitJoinRequest(token, phase.name, undefined, normalizeKidNames(kidNames)),
                  "google"
                );
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
            <h2 className="text-lg font-bold text-ink">{strings.join.title}</h2>
          </div>
          <JoinAbout />
          {/* above both ways in, so it counts for Google and for the typed form */}
          <KidNamesField id="join-kids" value={kidNames} onChange={setKidNames} />
          <div className="space-y-1">
            <button type="button" className={buttonPrimary} onClick={() => void withGoogle()}>
              {strings.join.google}
            </button>
            <p className="text-center text-xs text-ink-soft">{strings.join.googleHint}</p>
          </div>
          {googleOnly ? (
            <p className="text-center text-xs text-ink-soft">{strings.join.googleOnlyHint}</p>
          ) : (
            <>
              <p className="flex items-center gap-3 text-sm text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                {strings.join.or}
              </p>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    afterSubmit(
                      await submitJoinRequest(token, name.trim(), email.trim(), normalizeKidNames(kidNames)),
                      "email"
                    );
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
            </>
          )}
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

/**
 * A note from the family to someone who knows them: who we are, what is
 * inside, how to get in, signed. Everyone who reaches this page was sent here
 * by one of us or knows the address (Hadar 15/11/2026).
 */
function JoinAbout() {
  const j = strings.join;
  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-5 text-start shadow-card">
      <div className="space-y-1.5">
        <p className="sovev-display text-2xl leading-8 text-sea">{j.hello}</p>
        <p className="text-base leading-7 text-ink">{j.aboutIntro}</p>
      </div>

      <div className="space-y-2">
        <p className="ot-kicker">{j.aboutFindTitle}</p>
        <ul className="space-y-2">
          {j.aboutItems.map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm leading-6 text-ink">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sea-tint">
                {item.icon}
              </span>
              <span className="pt-0.5">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="ot-kicker">{j.aboutHowTitle}</p>
        <ol className="space-y-1.5">
          {j.aboutSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-2.5 text-sm leading-6 text-ink">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sea text-xs font-bold text-on-sea"
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-dashed border-line pt-3">
        <p className="text-sm text-ink-soft">{j.signOff}</p>
        <p className="sovev-display text-2xl leading-8 text-ink">{j.signature}</p>
      </div>

      <p className="text-xs text-ink-soft">{j.aboutPrivacy}</p>
    </div>
  );
}
