"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { isEnabled } from "@/lib/flags";
import { createStepToken, listStepTokens, listSteps, revokeStepToken, setMySteps, stepsIngestUrl, type StepToken } from "@/lib/data/steps";
import { todayISO } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.steps;
const noop = () => () => {};

function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Steps counter setup (Phase 2), parents only: create a token for this iPhone
 * (shown once, with the URL to post to), see which phones report, revoke one.
 */
export function StepsSettings() {
  const on = useSyncExternalStore(noop, () => isEnabled("stepsCounter"), () => false);
  const { member } = useMember();
  const [tokens, setTokens] = useState<StepToken[]>([]);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = member?.role === "owner";
  const [day, setDay] = useState(todayISO);
  const [count, setCount] = useState("");
  const [current, setCurrent] = useState<number | null | undefined>(undefined);
  const [manualMsg, setManualMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!on || !owner) return;
    let alive = true;
    void listStepTokens()
      .then((list) => alive && setTokens(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [on, owner, fresh]);

  const memberId = member?.id;
  useEffect(() => {
    if (!on || !owner || !memberId) return;
    let alive = true;
    void listSteps([memberId], day, day)
      .then((rows) => alive && setCurrent(rows[0]?.steps ?? null))
      .catch(() => alive && setCurrent(undefined));
    return () => {
      alive = false;
    };
  }, [on, owner, memberId, day]);

  if (!on || !owner) return null;

  async function saveManual() {
    const n = Number(count);
    if (count.trim() === "" || !Number.isInteger(n) || n < 0 || n > 200_000) {
      setManualMsg({ ok: false, text: t.manualInvalid });
      return;
    }
    try {
      await setMySteps(day, n);
      setCurrent(n);
      setCount("");
      setManualMsg({ ok: true, text: t.manualSaved });
    } catch {
      setManualMsg({ ok: false, text: t.manualError });
    }
  }

  async function copy(what: "token" | "url", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // the value is on screen to select by hand
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.settingsTitle}</h2>
      <p className="mt-1 text-xs text-ink-soft">{t.settingsHint}</p>

      {fresh ? (
        <div className="mt-3 space-y-2 rounded-xl bg-warning-soft p-3">
          <p className="text-sm font-semibold text-ink">{t.tokenOnce}</p>
          <code className="block break-all rounded-lg bg-surface p-2 text-sm text-ink" dir="ltr">{fresh}</code>
          <button type="button" onClick={() => void copy("token", fresh)} className="w-full rounded-lg bg-sea text-sm font-bold text-on-sea">
            {copied === "token" ? t.copied : t.copyToken}
          </button>
          <p className="text-xs font-semibold text-ink">{t.urlLabel}</p>
          <code className="block break-all rounded-lg bg-surface p-2 text-xs text-ink" dir="ltr">{stepsIngestUrl()}</code>
          <button type="button" onClick={() => void copy("url", stepsIngestUrl())} className="w-full rounded-lg border border-line bg-surface text-sm font-bold text-ink">
            {copied === "url" ? t.copied : t.copyUrl}
          </button>

        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t.labelField}</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.labelPlaceholder} maxLength={40} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink" />
          </label>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void createStepToken(label || member?.display_name || "")
                .then((tok) => setFresh(tok))
                .catch(() => setError(t.error));
            }}
            className="shrink-0 rounded-xl bg-sea px-3 text-sm font-bold text-on-sea"
          >
            {t.create}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}

      <details className="mt-3 rounded-xl bg-paper-deep px-3 py-1">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-bold text-sea">{t.guide}</summary>
        <ol className="list-decimal space-y-1.5 ps-5 pb-2 text-sm text-ink">
          {t.guideSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="pb-2 text-xs font-semibold text-ink-soft">{t.guideNote}</p>
      </details>

      <div className="mt-3 rounded-xl bg-paper-deep px-3 py-2.5">
        <h3 className="text-sm font-bold text-ink">{t.manualTitle}</h3>
        <p className="mt-0.5 text-xs text-ink-soft">{t.manualHint}</p>
        <div className="mt-2 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-soft">{t.manualDate}</span>
            <input
              type="date"
              value={day}
              max={todayISO()}
              onChange={(e) => {
                setDay(e.target.value || todayISO());
                setCurrent(undefined);
                setManualMsg(null);
              }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink"
            />
          </label>
          <label className="w-28 shrink-0">
            <span className="block text-xs font-semibold text-ink-soft">{t.manualSteps}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={200000}
              step={1}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setManualMsg(null);
              }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base tabular-nums text-ink"
              dir="ltr"
            />
          </label>
        </div>
        <p className="mt-1 text-xs tabular-nums text-ink-soft">
          {current === undefined ? "\u00a0" : current === null ? t.manualNone : t.manualCurrent.replace("{n}", current.toLocaleString("he-IL"))}
        </p>
        <button type="button" onClick={() => void saveManual()} className="mt-2 min-h-[44px] w-full rounded-lg bg-sea text-sm font-bold text-on-sea">
          {t.manualSave}
        </button>
        {manualMsg && (
          <p role={manualMsg.ok ? "status" : "alert"} className={`mt-1.5 text-sm font-semibold ${manualMsg.ok ? "text-ink" : "text-danger"}`}>
            {manualMsg.text}
          </p>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-ink-soft">{t.tokens}</p>
          <ul className="divide-y divide-line">
            {tokens.map((tok) => (
              <li key={tok.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{tok.label ?? "-"}</span>
                  <span className="block text-xs text-ink-soft">
                    {tok.revoked_at ? t.revoked : tok.last_used_at ? t.lastUsed.replace("{when}", when(tok.last_used_at)) : t.neverUsed}
                  </span>
                </span>
                {!tok.revoked_at && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await askConfirm(t.revokeConfirm))) return;
                      await revokeStepToken(tok.id).catch(() => {});
                      setTokens(await listStepTokens().catch(() => tokens));
                    }}
                    className="shrink-0 rounded-lg border border-line px-3 text-sm font-semibold text-danger"
                  >
                    {t.revoke}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
