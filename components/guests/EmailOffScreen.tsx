"use client";

import Link from "next/link";
import { useState } from "react";
import { unsubscribeEmailDigest } from "@/lib/data/guestEmail";
import { strings } from "@/lib/strings";

const t = strings.emailOff;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stops the guests' daily email from its link (00101). Waits for a press:
 * mail scanners open links on their own, and must not unsubscribe anyone.
 */
export function EmailOffScreen({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "already" | "error">(
    UUID.test(token) ? "idle" : "already"
  );

  async function stop() {
    setState("busy");
    try {
      setState((await unsubscribeEmailDigest(token)) ? "done" : "already");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-16 text-center">
      <h1 className="ot-title">{t.title}</h1>
      {state === "done" ? (
        <p className="font-semibold text-sea" role="status">{t.done}</p>
      ) : state === "already" ? (
        <p className="text-ink-soft" role="status">{t.already}</p>
      ) : (
        <>
          <p className="text-ink-soft">{t.body}</p>
          <button
            type="button"
            onClick={() => void stop()}
            disabled={state === "busy"}
            className="min-h-11 rounded-full bg-sea px-6 font-bold text-on-sea disabled:opacity-50"
          >
            {state === "busy" ? t.working : t.button}
          </button>
          {state === "error" && <p className="text-sm text-alert" role="alert">{t.error}</p>}
        </>
      )}
      <div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-sea underline">
          {t.home}
        </Link>
      </div>
    </div>
  );
}
