"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  DOCUMENT_TAGS,
  decryptDocument,
  listDocuments,
  listOfflineDocumentIds,
  makeAvailableOffline,
  openDocument,
  protectDocument,
  removeOfflineDocument,
  setDocumentSharedWithKids,
  unprotectDocument,
} from "@/lib/data/documents";
import {
  getVaultKey,
  hasDocPin,
  isVaultUnlocked,
  lockVault,
} from "@/lib/data/docPin";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Document, Trip } from "@/lib/types";
import { DocPinSheet } from "./DocPinSheet";
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

  // Documents PIN / vault state
  const [pinExists, setPinExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinSheet, setPinSheet] = useState<{ mode: "set" | "enter" } | null>(null);
  const [viewer, setViewer] = useState<{ url: string; mime: string } | null>(null);
  const pendingRef = useRef<((key: CryptoKey) => void) | null>(null);

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
        if (!cancelled) {
          setPinExists(await hasDocPin(activeTrip.id));
          setUnlocked(isVaultUnlocked(activeTrip.id));
        }
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

  // Runs an action with the vault key, prompting for the PIN first if locked.
  function withKey(action: (key: CryptoKey) => void) {
    if (!trip) return;
    const key = getVaultKey(trip.id);
    if (key) {
      action(key);
      return;
    }
    pendingRef.current = action;
    setPinSheet({ mode: pinExists ? "enter" : "set" });
  }

  async function runDoc(fn: () => Promise<void>, message: string) {
    if (!trip) return;
    try {
      await fn();
      await refresh(trip.id);
      showToast(message);
    } catch {
      showToast(strings.common.error);
    }
  }

  function toggleLock(doc: Document) {
    withKey((key) =>
      void runDoc(
        () =>
          doc.pin_protected
            ? unprotectDocument(doc, key)
            : protectDocument(doc, key),
        doc.pin_protected ? strings.documents.unlocked : strings.documents.locked
      )
    );
  }

  function openDoc(doc: Document) {
    if (!doc.pin_protected) {
      void handleOpen(doc);
      return;
    }
    showToast(strings.documents.unlocking);
    withKey((key) =>
      void (async () => {
        const blob = await decryptDocument(doc, key);
        if (!blob) {
          showToast(strings.documents.openFailed);
          return;
        }
        setViewer({ url: URL.createObjectURL(blob), mime: blob.type });
      })()
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
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
        className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
            tagFilter === null ? "bg-sea text-white" : "bg-paper-deep text-ink-soft"
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
              tagFilter === tag ? "bg-sea text-white" : "bg-paper-deep text-ink-soft"
            }`}
          >
            {strings.documents.tags[tag]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
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
                className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => (isKid ? void handleOpen(doc) : setForm({ doc }))}
                  className="min-w-0 flex-1 text-start"
                >
                  <span className="block truncate font-medium text-ink">
                    {doc.pin_protected && (
                      <span className="mr-1" aria-label={strings.documents.lockedBadge}>
                        🔒
                      </span>
                    )}
                    {doc.shared_with_kids && (
                      <span className="mr-1" aria-label={strings.documents.sharedBadge}>
                        🧒
                      </span>
                    )}
                    {doc.title}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {strings.documents.tags[doc.tag] ?? doc.tag}
                    {doc.notes ? ` · ${doc.notes}` : ""}
                  </span>
                </button>
                {!isKid && (
                  <button
                    type="button"
                    onClick={() => toggleLock(doc)}
                    aria-label={strings.documents.lock}
                    aria-pressed={doc.pin_protected}
                    className={`rounded-full p-2 ${
                      doc.pin_protected
                        ? "bg-rose-100 text-rose-700"
                        : "bg-paper-deep text-ink-soft"
                    }`}
                  >
                    <span className="block h-4 w-4 text-center text-sm leading-4" aria-hidden="true">
                      {doc.pin_protected ? "🔒" : "🔓"}
                    </span>
                  </button>
                )}
                {!isKid && !doc.pin_protected && (
                  <button
                    type="button"
                    onClick={() => void toggleShareWithKids(doc)}
                    aria-label={strings.documents.shareWithKids}
                    aria-pressed={doc.shared_with_kids}
                    className={`rounded-full p-2 ${
                      doc.shared_with_kids
                        ? "bg-amber-100 text-amber-700"
                        : "bg-paper-deep text-ink-soft"
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
                    isOffline ? "bg-sea-tint text-sea" : "bg-paper-deep text-ink-soft"
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
                  onClick={() => openDoc(doc)}
                  aria-label={strings.documents.open}
                  className="rounded-full bg-paper-deep p-2 text-ink-soft hover:bg-line"
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
          className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep"
        >
          {strings.documents.upload}
        </button>
      )}

      {!isKid && pinExists && unlocked && (
        <button
          type="button"
          onClick={() => {
            lockVault();
            setUnlocked(false);
          }}
          className="w-full text-center text-sm font-medium text-ink-soft"
        >
          🔒 {strings.documents.lockNow}
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

      {trip && pinSheet && (
        <DocPinSheet
          mode={pinSheet.mode}
          tripId={trip.id}
          onClose={() => {
            pendingRef.current = null;
            setPinSheet(null);
          }}
          onUnlocked={() => {
            setPinSheet(null);
            setPinExists(true);
            setUnlocked(true);
            const key = trip ? getVaultKey(trip.id) : null;
            const action = pendingRef.current;
            pendingRef.current = null;
            if (key && action) action(key);
          }}
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
          <div className="flex justify-end p-3">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(viewer.url);
                setViewer(null);
              }}
              className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink"
            >
              {strings.documents.viewerClose}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {viewer.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- decrypted blob URL
              <img
                src={viewer.url}
                alt=""
                className="mx-auto max-h-full max-w-full object-contain"
              />
            ) : (
              <iframe src={viewer.url} title="document" className="h-full w-full rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
