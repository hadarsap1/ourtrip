"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  isKidDevice,
  kidDisplayName,
  registerDevice,
  unlockWithPin,
} from "@/lib/data/kids";
import { strings } from "@/lib/strings";

export function KidLoginScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<"register" | "pin">(() =>
    isKidDevice() ? "pin" : "register"
  );
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setBusy(true);
    setMessage(null);
    try {
      await registerDevice(code.trim());
      setPhase("pin");
      setPin("");
    } catch {
      setMessage(strings.kidLogin.invalidCode);
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(fullPin: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await unlockWithPin(fullPin).catch(
      () => ({ status: "error" }) as const
    );
    setPin("");
    if (result.status === "ok") {
      router.replace("/");
      return;
    }
    if (result.status === "wrong") {
      setMessage(
        `${strings.kidLogin.wrongPin} (${strings.kidLogin.attemptsLeft}: ${result.attemptsLeft})`
      );
    } else if (result.status === "locked") {
      setMessage(strings.kidLogin.locked);
    } else if (!isKidDevice()) {
      // device was revoked — back to registration
      setPhase("register");
      setMessage(strings.kidLogin.invalidCode);
    } else {
      setMessage(strings.kidLogin.unlockError);
    }
    setBusy(false);
  }

  function pressDigit(digit: string) {
    if (busy) return;
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submitPin(next);
  }

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center px-6 py-8">
      <h1 className="mb-2 text-center text-3xl font-bold text-teal-700">
        {strings.kidLogin.title}
      </h1>

      {phase === "register" ? (
        <>
          <h2 className="mt-4 text-center text-lg font-semibold">
            {strings.kidLogin.codeTitle}
          </h2>
          <p className="mb-6 text-center text-sm text-slate-500">
            {strings.kidLogin.codeHint}
          </p>
          <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={strings.kidLogin.codePlaceholder}
              maxLength={8}
              autoFocus
              className="w-full rounded-2xl border-2 border-slate-300 px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] focus:border-teal-500 focus:outline-none"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="w-full rounded-2xl bg-teal-600 py-4 text-lg font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {strings.kidLogin.connect}
            </button>
          </form>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-center text-xl font-semibold">
            {strings.kidLogin.pinTitle}
            {kidDisplayName() ? ` ${kidDisplayName()}!` : "!"}
          </h2>
          <p className="mb-4 text-center text-sm text-slate-500">
            {strings.kidLogin.pinHint}
          </p>

          {/* PIN dots */}
          <div className="mb-6 flex justify-center gap-3" dir="ltr">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`h-4 w-4 rounded-full ${
                  i < pin.length ? "bg-teal-600" : "bg-slate-200"
                } ${i >= 4 && pin.length < 5 ? "opacity-40" : ""}`}
              />
            ))}
          </div>

          {/* number pad */}
          <div className="mx-auto grid w-64 grid-cols-3 gap-3" dir="ltr">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                disabled={busy}
                className="rounded-2xl bg-white py-4 text-2xl font-bold text-slate-800 shadow-sm active:bg-teal-50 disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin("")}
              disabled={busy}
              aria-label={strings.kidLogin.delete}
              className="rounded-2xl bg-slate-100 py-4 text-lg font-bold text-slate-500"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => pressDigit("0")}
              disabled={busy}
              className="rounded-2xl bg-white py-4 text-2xl font-bold text-slate-800 shadow-sm active:bg-teal-50 disabled:opacity-50"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => pin.length >= 4 && void submitPin(pin)}
              disabled={busy || pin.length < 4}
              className="rounded-2xl bg-teal-600 py-4 text-lg font-bold text-white disabled:opacity-40"
            >
              ✓
            </button>
          </div>
        </>
      )}

      {message && (
        <p className="mt-6 rounded-xl bg-rose-50 px-3 py-2.5 text-center text-sm font-medium text-rose-600">
          {message}
        </p>
      )}

      <Link
        href="/login"
        className="mt-8 text-center text-sm text-slate-400 underline"
      >
        {strings.kidLogin.backToParents}
      </Link>
    </div>
  );
}
