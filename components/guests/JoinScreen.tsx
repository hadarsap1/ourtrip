"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import Link from "next/link";
import { getJoinInfo, requestGuestLoginLink, submitJoinRequest } from "@/lib/data/guests";
import { networkDown } from "@/lib/offline/network";
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
  // optional parts, closed until asked for, so the button is on the first screen
  const [kidsOpen, setKidsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  // "send the link again" while waiting (email way in): the server allows one
  // a minute (guest-login-link), so the button rests as long
  const [resent, setResent] = useState(false);
  // No bottom bar on this page, so main's room for it is only empty scroll
  // (the same switch the chat uses, globals.css).
  useEffect(() => {
    document.body.dataset.chat = "1";
    return () => {
      delete document.body.dataset.chat;
    };
  }, []);

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
      // the connection, said as such: "something went wrong" read like a bad link
      setError(networkDown() ? strings.join.offline : strings.join.error);
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
  const linkButton = "text-sm font-semibold text-sea underline";
  const buttonSecondary =
    "w-full rounded-full border border-line bg-surface px-8 py-3 text-center font-semibold text-ink-soft disabled:opacity-60";

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 pb-3 pt-3">
      {/* One screen, no scrolling (Hadar 15/11/2026): the badge sits beside
          the name, and the optional parts below open on a tap. */}
      <div className="ot-postcard mb-3 flex items-center gap-3 px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand badge */}
        <img
          src="/sovev/badge-192.png"
          alt=""
          className="relative z-10 h-14 w-14 shrink-0 rounded-full border-2 border-white/90 object-cover"
        />
        <div className="relative z-10 min-w-0">
          <h1 className="text-2xl leading-7">{strings.appName}</h1>
          <p className="text-xs text-white/85">{strings.join.postcardLine}</p>
        </div>
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
          <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-sea underline">
            {strings.join.toLogin}
          </Link>
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
          {/* The email way in had only waiting (UX review 24/11/2026). Once
              approved, the login link may sit in spam: ask for it again. The
              reply never says whether this address was approved (00075). */}
          {phase.via === "email" &&
            (email.trim() ? (
              <>
                <button
                  type="button"
                  className={buttonSecondary}
                  disabled={busy || resent}
                  onClick={() =>
                    void run(async () => {
                      await requestGuestLoginLink(email.trim());
                      setResent(true);
                      setTimeout(() => setResent(false), 60_000);
                    })
                  }
                >
                  {strings.join.resendLink}
                </button>
                {resent && (
                  <p className="text-sm text-ink-soft" role="status">
                    {strings.join.resendSent}
                  </p>
                )}
              </>
            ) : (
              // back on this page later, the typed address is gone: the login
              // screen asks for it and sends the link
              <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-sea underline">
                {strings.join.approvedToLogin}
              </Link>
            ))}
        </div>
      )}

      {phase.kind === "signedIn" && (
        <div className="space-y-3 text-center">
          <JoinAbout />
          <div className="text-start">
            {kidsOpen ? (
              <KidNamesField id="join-kids-google" value={kidNames} onChange={setKidNames} />
            ) : (
              <button type="button" className={linkButton} onClick={() => setKidsOpen(true)}>
                {strings.join.kidsToggle}
              </button>
            )}
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
        <div className="space-y-3">
          <JoinAbout />
          {/* above both ways in, so it counts for Google and for the typed form */}
          {kidsOpen ? (
            <KidNamesField id="join-kids" value={kidNames} onChange={setKidNames} />
          ) : (
            <button type="button" className={linkButton} onClick={() => setKidsOpen(true)}>
              {strings.join.kidsToggle}
            </button>
          )}
          <div className="space-y-1">
            <button type="button" className={buttonPrimary} onClick={() => void withGoogle()}>
              {strings.join.google}
            </button>
            {!googleOnly && <p className="text-center text-xs text-ink-soft">{strings.join.googleHint}</p>}
          </div>
          {googleOnly ? (
            <p className="text-center text-xs text-ink-soft">{strings.join.googleOnlyHint}</p>
          ) : !emailOpen ? (
            <button type="button" className={`${linkButton} mx-auto block`} onClick={() => setEmailOpen(true)}>
              {strings.join.or}
            </button>
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
    <div className="space-y-2.5 rounded-card border border-line bg-surface px-4 py-3.5 text-start shadow-card">
      <div className="space-y-1">
        <p className="sovev-display text-2xl leading-7 text-sea">{j.hello}</p>
        <p className="text-sm leading-6 text-ink">{j.aboutIntro}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {j.aboutItems.map((item) => (
          <li key={item.text} className="flex items-center gap-1.5 rounded-xl bg-sea-tint px-2.5 py-2 text-sm font-medium text-ink">
            <span aria-hidden="true">{item.icon}</span>
            <span className="min-w-0">{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-ink">
        <span className="text-sm text-ink-soft">{j.signOff} </span>
        <span className="sovev-display text-xl">{j.signature}</span>
      </p>
      <p className="text-xs text-ink-soft">{j.aboutPrivacy}</p>
    </div>
  );
}
