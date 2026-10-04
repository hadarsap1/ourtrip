"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { buildBackup, dryRunRestore, validateBackup, type TableDiff } from "@/lib/backup";
import { fetchBackupData } from "@/lib/data/backup";
import { getActiveTrip } from "@/lib/data/trip";
import { isEnabled } from "@/lib/flags";
import { formatDate } from "@/lib/format";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

const t = strings.backup;
const noop = () => () => {};

/**
 * Backup / export (2.8), parents only: download the trip as one JSON file, and
 * a restore dry run that compares a chosen file with the current data -
 * reading only, never writing.
 */
export function BackupCard() {
  const on = useSyncExternalStore(noop, () => isEnabled("backupExport"), () => false);
  const { member } = useMember();
  const [busy, setBusy] = useState<"export" | "check" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ date: string; rows: TableDiff[]; otherTrip: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!on || member?.role !== "owner") return null;

  async function exportNow() {
    setBusy("export");
    setNote(null);
    try {
      const trip = await getActiveTrip();
      if (!trip) throw new Error("no trip");
      const backup = buildBackup(trip.id, await fetchBackupData(trip.id));
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ourtrip-backup-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote(t.exported);
    } catch {
      setNote(t.errors.fetch);
    } finally {
      setBusy(null);
    }
  }

  async function check(file: File) {
    setBusy("check");
    setNote(null);
    setResult(null);
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        setNote(t.errors.not_json);
        return;
      }
      const v = validateBackup(raw);
      if (!v.ok) {
        setNote(t.errors[v.error]);
        return;
      }
      const trip = await getActiveTrip();
      if (!trip) throw new Error("no trip");
      const current = await fetchBackupData(trip.id);
      setResult({ date: v.backup.exportedAt.slice(0, 10), rows: dryRunRestore(v.backup, current), otherTrip: v.backup.tripId !== trip.id });
    } catch {
      setNote(t.errors.fetch);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const diffs = result?.rows.filter((r) => r.wouldRestore || r.changed || r.onlyNow) ?? [];

  return (
    <section className="rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <h2 className="text-sm font-bold text-ink">{t.title}</h2>
      <p className="mt-1 text-[12px] text-ink-soft">{t.hint}</p>
      <button type="button" onClick={() => void exportNow()} disabled={busy !== null} className="mt-3 w-full rounded-xl bg-sea text-sm font-bold text-on-sea disabled:opacity-60">
        {busy === "export" ? t.exporting : t.export}
      </button>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[13px] font-semibold text-ink">{t.dryRun}</p>
        <p className="text-[12px] text-ink-soft">{t.dryRunHint}</p>
        <label className="mt-2 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-sm font-bold text-ink">
          {busy === "check" ? t.checking : t.pick}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && void check(e.target.files[0])} />
        </label>
      </div>

      {note && <p role="status" className="mt-2 text-sm font-semibold text-ink-soft">{note}</p>}

      {result && (
        <div className="mt-3">
          <p className="text-[13px] font-bold text-ink">{t.resultTitle.replace("{date}", formatDate(result.date))}</p>
          {result.otherTrip && <p className="mt-1 rounded-lg bg-warning-soft px-2 py-1 text-[12px] font-semibold text-warning">{t.otherTrip}</p>}
          {diffs.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-soft">{t.noDiff}</p>
          ) : (
            <table className="mt-2 w-full text-[12px]">
              <thead>
                <tr className="text-ink-soft">
                  <th className="py-1 text-start font-semibold">{t.colTable}</th>
                  <th className="py-1 font-semibold">{t.colRestore}</th>
                  <th className="py-1 font-semibold">{t.colChanged}</th>
                  <th className="py-1 font-semibold">{t.colNew}</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.table} className="border-t border-line text-ink">
                    <td className="py-1.5">{(t.tables as Record<string, string>)[d.table] ?? d.table}</td>
                    <td className="py-1.5 text-center tabular-nums">{d.wouldRestore}</td>
                    <td className="py-1.5 text-center tabular-nums">{d.changed}</td>
                    <td className="py-1.5 text-center tabular-nums">{d.onlyNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
