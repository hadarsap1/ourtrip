"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { needsKidUnlock } from "@/lib/data/kids";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getSupabase, storedAuthUserId } from "@/lib/supabase";
import { offlineNow, TimeoutError, withTimeout } from "@/lib/offline/network";
import { SuitcaseIcon } from "@/components/icons";
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
// supabase-js retries a failed token refresh for up to ~30 s before answering.
const SESSION_TIMEOUT_MS = 5000;

async function decide(): Promise<Exclude<GateState, "loading">> {
  const supabase = getSupabase();
  if (!supabase) return "allowed";

  // Kid device on a cold start: PIN gate first (server-verified,
  // rate-limited in kid-auth), regardless of any stored session.
  if (needsKidUnlock()) return "redirecting";

  // Offline with a login saved on this phone: open the app. The login page is
  // a dead end with no network, and the offline-critical screens must open.
  if (offlineNow()) return storedAuthUserId() ? "allowed" : "redirecting";

  const { data, error: sessionError } = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS).catch(
    (err: unknown) => ({ data: { session: null }, error: err })
  );
  if (!data.session) {
    // "No session" because the expired token could not be renewed (no signal,
    // or a hung line) is not "signed out": the login is still on the phone and
    // renews once there is a connection. RLS still decides every read.
    const couldNotAsk = isAuthRetryableFetchError(sessionError) || sessionError instanceof TimeoutError;
    return couldNotAsk && storedAuthUserId() ? "allowed" : "redirecting";
  }

  // Link auth user ↔ seeded member row; null role = not allowed.
  const { data: role, error } = await supabase.rpc("link_member_to_auth_user");

  // Network failure (offline etc.) - can't verify. A locally stored session is
  // enough to render the shell: real security is RLS, and the offline-critical
  // screens must open with no connectivity.
  if (error) return "allowed";

  if (!role) {
    await supabase.auth.signOut();
    return "rejected";
  }
  return "allowed";
}

// Client-side routing gate only - real security is RLS in the database.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Bypass cases need no async check: the login pages themselves, the offline
  // fallback (it is served precisely when no round-trip can succeed, and it
  // shows no trip data), and local dev before the Supabase env is wired up
  // (shell should still render).
  const bypass =
    pathname === "/login" ||
    pathname === "/kid-login" ||
    pathname === "/offline" ||
    !getSupabase();

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
    // below - an optimistic render must never become a cached verdict.
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
        <SuitcaseIcon className="mx-auto h-10 w-10 text-sea" />
        <p className="mt-3 text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return <>{children}</>;
}
