"use client";

import { useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { CameraIcon, CloseIcon, TrashIcon } from "@/components/icons";
import {
  addReceiptOrQueue,
  deleteReceipt,
  getReceiptUrls,
  prepareReceipt,
  type PreparedReceipt,
} from "@/lib/data/receipts";
import { strings } from "@/lib/strings";
import type { ExpenseReceipt } from "@/lib/types";

/** A photo taken in this form that is not saved yet (new expense). */
export type PendingReceipt = PreparedReceipt & { key: string; url: string };

type Viewing = { src: string | null; receipt?: ExpenseReceipt; pendingKey?: string; n: number };

/**
 * Receipt photos on an expense (00083).
 *
 * Editing an expense, a photo goes up as soon as it is taken (or waits in the
 * offline queue). On a new expense there is nothing to attach it to yet, so
 * photos are held here and the form saves them with the expense.
 */
export function ReceiptsField({
  expenseId,
  receipts,
  pending,
  onPendingChange,
  onChanged,
  onMessage,
}: {
  /** null on a new expense */
  expenseId: string | null;
  receipts: ExpenseReceipt[];
  pending: PendingReceipt[];
  onPendingChange: (next: PendingReceipt[]) => void;
  /** a receipt was added or removed on a saved expense */
  onChanged: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const s = strings.budget;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [viewing, setViewing] = useState<Viewing | null>(null);

  // signed URLs for the saved receipts; offline they simply stay missing
  const pathsKey = receipts.map((r) => r.file_path).join("|");
  useEffect(() => {
    let cancelled = false;
    const paths = pathsKey ? pathsKey.split("|") : [];
    if (paths.length === 0) return;
    void getReceiptUrls(paths)
      .then((m) => {
        if (!cancelled) setUrls(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathsKey]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    try {
      const prepared = await Promise.all([...files].map((f) => prepareReceipt(f)));
      if (expenseId === null) {
        onPendingChange([
          ...pending,
          ...prepared.map((p) => ({
            ...p,
            key: crypto.randomUUID(),
            url: URL.createObjectURL(p.blob),
          })),
        ]);
        return;
      }
      let queued = 0;
      for (const p of prepared) {
        const result = await addReceiptOrQueue({ expenseId, blob: p.blob, mime: p.mime });
        if (result === "queued") queued++;
      }
      onChanged(queued > 0 ? s.receiptQueued : s.receiptSaved);
    } catch {
      onMessage(strings.common.error);
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  async function handleDelete(v: Viewing) {
    if (v.pendingKey) {
      const gone = pending.find((p) => p.key === v.pendingKey);
      if (gone) URL.revokeObjectURL(gone.url);
      onPendingChange(pending.filter((p) => p.key !== v.pendingKey));
      setViewing(null);
      return;
    }
    if (!v.receipt) return;
    if (!(await askConfirm(s.receiptDeleteConfirm))) return;
    try {
      await deleteReceipt(v.receipt);
      setViewing(null);
      onChanged(s.receiptSaved);
    } catch {
      onMessage(strings.common.error);
    }
  }

  const thumbs: Viewing[] = [
    ...receipts.map((r, i) => ({ src: urls.get(r.file_path) ?? null, receipt: r, n: i + 1 })),
    ...pending.map((p, i) => ({ src: p.url, pendingKey: p.key, n: receipts.length + i + 1 })),
  ];

  const buttonClass =
    "flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-sea disabled:opacity-50";

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink-soft">{s.receipts}</span>
      <div className="flex flex-wrap items-center gap-2">
        {thumbs.map((t) => (
          <button
            key={t.receipt?.id ?? t.pendingKey}
            type="button"
            onClick={() => setViewing(t)}
            aria-label={s.receiptView.replace("{n}", String(t.n))}
            className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-paper-deep"
          >
            {t.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed / blob URLs, not optimisable
              <img src={t.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <CameraIcon className="m-auto h-5 w-5 text-ink-faint" />
            )}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className={buttonClass}
        >
          <CameraIcon className="h-4 w-4" />
          {busy ? s.receiptPreparing : s.receiptTake}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
          className={`${buttonClass} text-ink-soft`}
        >
          {s.receiptGallery}
        </button>
      </div>
      {expenseId === null && pending.length > 0 && (
        <p className="mt-1 text-xs text-ink-soft">{s.receiptWillSave}</p>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={s.receiptView.replace("{n}", String(viewing.n))}
          className="fixed inset-0 z-[70] flex flex-col bg-black/90"
        >
          <div className="flex items-center justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => setViewing(null)}
              aria-label={strings.common.close}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(viewing)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-bold text-white"
            >
              <TrashIcon className="h-4 w-4" />
              {viewing.pendingKey ? s.receiptRemove : s.receiptDelete}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {viewing.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed / blob URLs, not optimisable
              <img src={viewing.src} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="text-center text-sm text-white/80">{s.receiptOffline}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
