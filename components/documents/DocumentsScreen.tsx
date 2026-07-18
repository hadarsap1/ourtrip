"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  DOCUMENT_TAGS,
  listDocuments,
  listOfflineDocumentIds,
  makeAvailableOffline,
  openDocument,
  removeOfflineDocument,
  setDocumentSharedWithKids,
} from "@/lib/data/documents";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Document, Trip } from "@/lib/types";
import { DocumentFormSheet } from "./DocumentFormSheet";

export function DocumentsScreen() {
  const { member } = useMember();
  const isKid = member?.role === "kid";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ doc: Document | null } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDocs, ids] = await Promise.all([
      listDocuments(tripId),
      listOfflineDocumentIds(),
    ]);
    setDocs(nextDocs);
    setOfflineIds(new Set(ids));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  async function toggleOffline(doc: Document) {
    if (busyIds.has(doc.id)) return;
    setBusyIds((prev) => new Set(prev).add(doc.id));
    try {
      if (offlineIds.has(doc.id)) {
        await removeOfflineDocument(doc.id);
        setOfflineIds((prev) => {
          const next = new Set(prev);
          next.delete(doc.id);
          return next;
        });
        showToast(strings.documents.offlineRemoved);
      } else {
        await makeAvailableOffline(doc);
        setOfflineIds((prev) => new Set(prev).add(doc.id));
        showToast(strings.documents.offlineSaved);
      }
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  }

  async function handleOpen(doc: Document) {
    const opened = await openDocument(doc);
    if (!opened) showToast(strings.documents.openFailed);
  }

  async function toggleShareWithKids(doc: Document) {
    try {
      await setDocumentSharedWithKids(doc.id, !doc.shared_with_kids);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, shared_with_kids: !doc.shared_with_kids } : d
        )
      );
      showToast(
        doc.shared_with_kids
          ? strings.documents.unsharedWithKids
          : strings.documents.sharedWithKids
      );
    } catch {
      showToast(strings.common.error);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-slate-500">{strings.common.loading}</p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visible = docs.filter((doc) => {
    if (tagFilter && doc.tag !== tagFilter) return false;
    if (!query) return true;
    return (
      doc.title.toLowerCase().includes(query) ||
      (doc.notes ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      {isKid && (
        <h1 className="text-2xl font-bold">{strings.documents.kidTitle}</h1>
      )}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={strings.documents.searchPlaceholder}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none"
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
            tagFilter === null ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {strings.documents.allTags}
        </button>
        {DOCUMENT_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
              tagFilter === tag ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {strings.documents.tags[tag]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {docs.length === 0
            ? isKid
              ? strings.documents.kidEmpty
              : strings.documents.empty
            : strings.documents.noResults}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((doc) => {
            const isOffline = offlineIds.has(doc.id);
            const busy = busyIds.has(doc.id);
            return (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => (isKid ? void handleOpen(doc) : setForm({ doc }))}
                  className="min-w-0 flex-1 text-start"
                >
                  <span className="block truncate font-medium text-slate-800">
                    {doc.shared_with_kids && (
                      <span className="mr-1" aria-label={strings.documents.sharedBadge}>
                        🧒
                      </span>
                    )}
                    {doc.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    {strings.documents.tags[doc.tag] ?? doc.tag}
                    {doc.notes ? ` · ${doc.notes}` : ""}
                  </span>
                </button>
                {!isKid && (
                  <button
                    type="button"
                    onClick={() => void toggleShareWithKids(doc)}
                    aria-label={strings.documents.shareWithKids}
                    aria-pressed={doc.shared_with_kids}
                    className={`rounded-full p-2 ${
                      doc.shared_with_kids
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <span className="block h-4 w-4 text-center text-sm leading-4" aria-hidden="true">
                      🧒
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void toggleOffline(doc)}
                  disabled={busy}
                  aria-label={strings.documents.offlineToggle}
                  aria-pressed={isOffline}
                  className={`rounded-full p-2 disabled:opacity-40 ${
                    isOffline ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                    {isOffline ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    )}
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpen(doc)}
                  aria-label={strings.documents.open}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!isKid && (
        <button
          type="button"
          onClick={() => setForm({ doc: null })}
          className="w-full rounded-2xl bg-teal-600 py-3 font-semibold text-white shadow hover:bg-teal-700"
        >
          {strings.documents.upload}
        </button>
      )}

      {trip && !isKid && (
        <DocumentFormSheet
          open={form !== null}
          tripId={trip.id}
          doc={form?.doc ?? null}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            refreshNow();
          }}
          onError={() => showToast(strings.common.error)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
