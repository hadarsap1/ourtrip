"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
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
