"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { needsKidUnlock } from "@/lib/data/kids";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";

type GateState = "loading" | "allowed" | "rejected";

// Client-side routing gate only — real security is RLS in the database.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const pathname = usePathname();
  const router = useRouter();

  // Bypass cases need no async check: the login pages themselves, and local
  // dev before the Supabase env is wired up (shell should still render).
  const bypass =
    pathname === "/login" || pathname === "/kid-login" || !getSupabase();

  useEffect(() => {
    if (bypass) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      // Kid device on a cold start: PIN gate first (server-verified,
      // rate-limited in kid-auth), regardless of any stored session.
      if (needsKidUnlock()) {
        router.replace("/kid-login");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      // Link auth user ↔ seeded member row; null role = not allowed.
      const { data: role, error } = await supabase.rpc("link_member_to_auth_user");
      if (cancelled) return;

      if (error) {
        // Network failure (offline etc.) — can't verify. A locally stored
        // session is enough to render the shell: real security is RLS, and
        // the offline-critical screens must open with no connectivity.
        setState("allowed");
        return;
      }

      if (!role) {
        await supabase.auth.signOut();
        setState("rejected");
        return;
      }

      setState("allowed");
    })();

    return () => {
      cancelled = true;
    };
  }, [bypass, pathname, router]);

  if (bypass) {
    return <>{children}</>;
  }

  if (state === "rejected") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">
          {strings.auth.notAllowedTitle}
        </h1>
        <p className="text-ink-soft">{strings.auth.notAllowedBody}</p>
      </div>
    );
  }

  if (state === "loading") {
    return null;
  }

  return <>{children}</>;
}
