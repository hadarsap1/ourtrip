"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { requestGuestLoginLink } from "@/lib/data/guests";
import { strings } from "@/lib/strings";

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = getSupabase();

  async function signIn() {
    if (!supabase) {
      setError(strings.auth.missingEnv);
      return;
    }
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  }

  // guests who joined with an email have no Google way in (00075)
  async function sendLink() {
    if (sending || !email.trim()) return;
    setSending(true);
    setError(null);
    try {
      await requestGuestLoginLink(email.trim());
      setSent(true);
    } catch {
      setError(strings.auth.emailError);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 pb-16">
      <div className="ot-postcard mb-8 p-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand badge */}
        <img
          src="/sovev/badge-192.png"
          alt=""
          className="relative z-10 mx-auto h-24 w-24 rounded-full border-[3px] border-white/90 object-cover"
        />
        <h1 className="relative z-10 mt-3 text-4xl">{strings.appName}</h1>
        <p className="relative z-10 mt-1 text-white/80">{strings.appDescription}</p>
      </div>
      <button
        type="button"
        onClick={signIn}
        className="rounded-full bg-sea px-8 py-3.5 text-center font-semibold text-on-sea shadow-sm active:bg-sea-deep"
      >
        {strings.auth.signIn}
      </button>
      <p className="my-5 flex items-center gap-3 text-sm text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        {strings.auth.or}
      </p>
      {sent ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-center text-sm text-ink" role="status">
          {strings.auth.emailSent}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink();
          }}
        >
          <label htmlFor="login-email" className="block text-center text-sm font-medium text-ink-soft">
            {strings.auth.emailTitle}
          </label>
          <input
            id="login-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            placeholder={strings.auth.emailLabel}
            aria-label={strings.auth.emailLabel}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-full border border-line bg-surface px-8 py-3 text-center font-semibold text-ink-soft disabled:opacity-60"
          >
            {sending ? strings.auth.emailSending : strings.auth.emailSend}
          </button>
        </form>
      )}
      {error && (
        <p className="mt-5 text-center text-sm text-rose-600">{error}</p>
      )}
      <Link
        href="/kid-login"
        className="mt-8 inline-flex min-h-[44px] items-center justify-center self-center text-sm text-ink-soft underline"
      >
        {strings.kidLogin.title}
      </Link>
    </div>
  );
}
