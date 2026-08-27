"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { needsKidUnlock } from "@/lib/data/kids";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";

type GateState = "loading" | "allowed" | "rejected" | "redirecting";

// The verdict is per session, not per route: re-running two round-trips on
// every tab switch made navigation feel like a page load.
let decided: Exclude<GateState, "loading"> | null = null;
let inFlight: Promise<Exclude<GateState, "loading">> | null = null;

// Past this we stop blocking the UI and render optimistically. Rendering
// nothing on a flaky connection is what produced the "white page until you
// refresh" reports, and blocking buys no safety: access control is RLS in the
// database (CLAUDE.md rule #1). The real verdict still lands when it arrives.
const GATE_TIMEOUT_MS = 2500;

async function decide(): Promise<Exclude<GateState, "loading">> {
  const supabase = getSupabase();
  if (!supabase) return "allowed";

  // Kid device on a cold start: PIN gate first (server-verified,
  // rate-limited in kid-auth), regardless of any stored session.
  if (needsKidUnlock()) return "redirecting";

  const { data } = await supabase.auth.getSession();
  if (!data.session) return "redirecting";

  // Link auth user ↔ seeded member row; null role = not allowed.
  const { data: role, error } = await supabase.rpc("link_member_to_auth_user");

  // Network failure (offline etc.) — can't verify. A locally stored session is
  // enough to render the shell: real security is RLS, and the offline-critical
  // screens must open with no connectivity.
  if (error) return "allowed";

  if (!role) {
    await supabase.auth.signOut();
    return "rejected";
  }
  return "allowed";
}

// Client-side routing gate only — real security is RLS in the database.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Bypass cases need no async check: the login pages themselves, and local
  // dev before the Supabase env is wired up (shell should still render).
  const bypass =
    pathname === "/login" || pathname === "/kid-login" || !getSupabase();

  const [state, setState] = useState<GateState>(() => decided ?? "loading");

  useEffect(() => {
    if (bypass) return;
    if (decided) {
      // Verdict already known: only the redirect still needs re-issuing, in
      // case this mount came from a route that bypassed the gate.
      if (decided === "redirecting") {
        router.replace(needsKidUnlock() ? "/kid-login" : "/login");
      }
      return;
    }

    let cancelled = false;
    // Share one check across mounts (and across StrictMode's double effect).
    inFlight ??= decide().catch(() => "allowed" as const);

    // Unblock the UI if the check is slow, but keep waiting for the answer
    // below — an optimistic render must never become a cached verdict.
    const timer = setTimeout(() => {
      if (!cancelled) setState((s) => (s === "loading" ? "allowed" : s));
    }, GATE_TIMEOUT_MS);

    void inFlight.then((verdict) => {
      decided = verdict;
      inFlight = null;
      clearTimeout(timer);
      if (cancelled) return;
      if (verdict === "redirecting") {
        router.replace(needsKidUnlock() ? "/kid-login" : "/login");
      }
      setState(verdict);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bypass, router]);

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

  // Never render an empty document: a blank screen is indistinguishable from
  // a crash, which is exactly why people were force-refreshing.
  if (state === "loading" || state === "redirecting") {
    return (
      <div
        className="mx-auto max-w-lg px-4 pt-24 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-4xl" aria-hidden="true">🧳</p>
        <p className="mt-3 text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return <>{children}</>;
}
