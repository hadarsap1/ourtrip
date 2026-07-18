"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createRoute, DAY_COLORS } from "@/lib/data/map";
import { parseSheet, toRoutePoints } from "@/lib/importFile";
import { strings } from "@/lib/strings";

export function ImportRouteSheet({
  tripId,
  onClose,
  onDone,
}: {
  tripId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const s = strings.map;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await parseSheet(file);
      const points = toRoutePoints(rows);
      if (points.length < 2) {
        setError(s.importRouteNeedPoints);
        setBusy(false);
        return;
      }
      await createRoute({
        tripId,
        name: name.trim() || s.importRouteFallback,
        path: points.map((p) => [p.lat, p.lng] as [number, number]),
        color: DAY_COLORS[0],
      });
      onDone(s.routeImported.replace("{n}", String(points.length)));
    } catch {
      setError(s.importRouteFailed);
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-teal-500 focus:outline-none";

  return (
    <Sheet open onClose={onClose} title={s.importRouteTitle}>
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-sm text-slate-500">{s.importRouteHint}</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">
            {s.routeName}
          </span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={s.importRouteFallback}
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-700"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? strings.common.loading : s.importRoute}
        </button>
      </form>
    </Sheet>
  );
}
