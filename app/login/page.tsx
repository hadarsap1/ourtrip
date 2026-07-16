"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";

export default function LoginPage() {
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
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 pt-24 text-center">
      <h1 className="mb-2 text-3xl font-bold">{strings.appName}</h1>
      <p className="mb-10 text-slate-500">{strings.appDescription}</p>
      <button
        onClick={signIn}
        className="rounded-full bg-teal-600 px-8 py-3 font-semibold text-white shadow-sm active:bg-teal-700"
      >
        {strings.auth.signIn}
      </button>
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
    </div>
  );
}
