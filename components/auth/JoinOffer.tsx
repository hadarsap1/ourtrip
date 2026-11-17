"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOpenJoinToken } from "@/lib/data/guests";
import { getSupabase } from "@/lib/supabase";
import { strings } from "@/lib/strings";

/**
 * "Not approved yet? Ask to join" - the app's address is the one link a guest
 * keeps (00093), so someone who opens it and was never approved can still ask.
 * Goes to the trip's join page, the same one the printed QR opens. Renders
 * nothing until the token arrives, or when there is no join link (or no
 * network): the screen around it works without it.
 */
export function JoinOffer({ className = "" }: { className?: string }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!getSupabase()) return;
    let cancelled = false;
    void getOpenJoinToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!token) return null;
  return (
    <p className={`text-center text-sm text-ink-soft ${className}`}>
      {strings.auth.joinPrompt}{" "}
      <Link
        href={`/join/${encodeURIComponent(token)}`}
        className="inline-flex min-h-[44px] items-center font-semibold text-sea underline"
      >
        {strings.auth.joinLink}
      </Link>
    </p>
  );
}
